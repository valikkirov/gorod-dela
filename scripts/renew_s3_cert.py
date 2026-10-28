"""Переносит свежий сертификат Let's Encrypt из Менеджера сертификатов Selectel в S3 (домен www.gorod-dela.ru).

Let's Encrypt в Менеджере продлевается сам, а S3 берёт сертификат только загрузкой — этот скрипт и загружает.
Запускается из GitHub Actions (.github/workflows/cert.yml) раз в неделю.

Переменные окружения:
  SEL_USER, SEL_PASSWORD   — сервисный пользователь Selectel (секреты GitHub)
  SEL_ACCOUNT, SEL_PROJECT — номер аккаунта и ID проекта
  CERT_DOMAIN              — домен, по которому ищется сертификат (www.gorod-dela.ru)
  FORCE=1                  — загрузить, даже если в S3 уже такой же срок

Приватный ключ никуда не печатается: он идёт только в тело запроса к S3.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

AUTH_URL = 'https://cloud.api.selcloud.ru/identity/v3/auth/tokens'
CM_URL = 'https://cloud.api.selcloud.ru/certificate-manager/v1'
# SSL-сертификаты S3 для страны «Россия» (бакет в ru-7) — тот же адрес, что использует панель
S3_SSL_URL = 'https://api.ru-6.storage.selcloud.ru/v2/ssl'
RENEW_DAYS = 30


def log(msg: str) -> None:
    # Заметка видна в сводке запуска на GitHub, без открытия логов
    print(f'::notice title=Сертификат::{msg}', flush=True)


def fail(msg: str) -> None:
    print(f'::error title=Сертификат::{msg}', flush=True)
    sys.exit(1)


def request(method: str, url: str, token: str | None = None, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('X-Auth-Token', token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            payload = r.read()
            if raw:
                return r, payload
            if not payload:
                return None
            try:
                return json.loads(payload)
            except ValueError:
                # PEM отдаётся простым текстом
                return payload.decode(errors='replace')
    except urllib.error.HTTPError as e:
        # Тело ошибки печатаем — в нём нет секретов (ключ мы отправляем, а не получаем)
        text = e.read().decode(errors='replace')[:500]
        fail(f'{method} {url} → {e.code}: {text}')


def token() -> str:
    body = {
        'auth': {
            'identity': {
                'methods': ['password'],
                'password': {
                    'user': {
                        'name': os.environ['SEL_USER'],
                        'domain': {'name': os.environ['SEL_ACCOUNT']},
                        'password': os.environ['SEL_PASSWORD'],
                    }
                },
            },
            'scope': {'project': {'id': os.environ['SEL_PROJECT']}},
        }
    }
    r, _ = request('POST', AUTH_URL, body=body, raw=True)
    t = r.headers.get('X-Subject-Token')
    if not t:
        fail('Selectel не выдал токен')
    print(f'::add-mask::{t}')
    return t


def items(data):
    """Списки в ответах бывают и голыми массивами, и внутри объекта"""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list):
                return v
    return []


def parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace('Z', '+00:00'))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def pem_expiry(pem: str) -> datetime:
    out = subprocess.run(['openssl', 'x509', '-noout', '-enddate'], input=pem, capture_output=True, text=True, check=True)
    end = out.stdout.strip().split('=', 1)[1]
    return datetime.strptime(end, '%b %d %H:%M:%S %Y %Z').replace(tzinfo=timezone.utc)


def find_pem(data, marker: str) -> str | None:
    """Ищет PEM-блок в ответе любой формы, не печатая содержимое"""
    if isinstance(data, str):
        return data if marker in data else None
    if isinstance(data, dict):
        for v in data.values():
            found = find_pem(v, marker)
            if found:
                return found
    if isinstance(data, list):
        parts = [p for p in (find_pem(v, marker) for v in data) if p]
        return '\n'.join(parts) if parts else None
    return None


def shape(data, depth=0):
    """Только структура ответа (ключи и типы) — чтобы разобраться, не раскрывая значений"""
    if depth > 3:
        return '…'
    if isinstance(data, dict):
        return {k: shape(v, depth + 1) for k, v in data.items()}
    if isinstance(data, list):
        return [shape(data[0], depth + 1)] if data else []
    return type(data).__name__


def to_pkcs8(key: str) -> str:
    if 'BEGIN RSA PRIVATE KEY' not in key and 'BEGIN EC PRIVATE KEY' not in key:
        return key
    out = subprocess.run(['openssl', 'pkcs8', '-topk8', '-nocrypt'], input=key, capture_output=True, text=True)
    return out.stdout if out.returncode == 0 and 'BEGIN PRIVATE KEY' in out.stdout else key


def main() -> None:
    domain = os.environ.get('CERT_DOMAIN', 'www.gorod-dela.ru')
    force = os.environ.get('FORCE') == '1'
    t = token()

    # 1. Сертификат в Менеджере (Let's Encrypt хранится там же, среди сертификатов пользователя)
    certs = items(request('GET', f'{CM_URL}/certs', t))
    mine = [c for c in certs if domain in (c.get('dns_names') or c.get('domains') or [])]
    if not mine:
        log(f'Структура списка: {json.dumps(shape(certs[:1]), ensure_ascii=False)}')
        fail(f'В Менеджере сертификатов нет сертификата для {domain}')
    log(f'Менеджер: сертификатов для домена — {len(mine)}')
    knox_ids = [c.get('id') for c in mine if c.get('id')]

    # 2. Что сейчас стоит в S3
    s3 = [c for c in items(request('GET', S3_SSL_URL, t)) if domain in (c.get('domains') or [])]
    s3_end = max((d for d in (parse_date(c.get('expire_at') or c.get('not_after') or c.get('valid_to')) for c in s3) if d), default=None)
    log(f'S3: сертификатов для домена — {len(s3)}, действует до {s3_end}')

    # 3. Самый свежий сертификат по сроку из карточки, затем его файлы (цепочка начинается с самого сертификата)
    metas = [request('GET', f'{CM_URL}/cert/{cid}', t) for cid in knox_ids]
    metas = [m for m in metas if isinstance(m, dict) and parse_date((m.get('validity') or {}).get('notAfter'))]
    if not metas:
        fail('В карточке сертификата нет срока действия')
    meta = max(metas, key=lambda m: parse_date(m['validity']['notAfter']))
    knox = meta['id']
    chain_data = request('GET', f'{CM_URL}/cert/{knox}/ca_chain', t)
    full = find_pem(chain_data, 'BEGIN CERTIFICATE')
    if not full:
        log(f'Структура ответа цепочки: {json.dumps(shape(chain_data), ensure_ascii=False)}')
        fail('Не нашёл файлы сертификата в Менеджере')
    new_end = pem_expiry(full)
    log(f'Свежий сертификат действует до {new_end:%d.%m.%Y}')

    left = (s3_end - datetime.now(timezone.utc)).days if s3_end else -1
    if not force and s3_end and new_end <= s3_end:
        log(f'В S3 уже стоит этот или более свежий сертификат (осталось {left} дн.) — ничего не делаю')
        if left < 14:
            print(f'::warning title=Сертификат::До конца сертификата в S3 {left} дн., а свежего в Менеджере нет')
        return

    key_data = request('GET', f'{CM_URL}/cert/{knox}/private_key', t)
    key = find_pem(key_data, 'PRIVATE KEY')
    if not key:
        log(f'Структура ответа: {json.dumps(shape(key_data), ensure_ascii=False)}')
        fail('Не нашёл приватный ключ в ответе Менеджера')
    for line in key.strip().splitlines():
        if line and 'PRIVATE KEY' not in line:
            print(f'::add-mask::{line.strip()}')
    key = to_pkcs8(key.strip())
    full = full.strip()

    # 4. Загрузка в S3 и ожидание проверки
    # S3 принимает в имени только латиницу, цифры и «_»
    name = f"gorod_dela_{new_end:%Y%m%d}"
    created = request('POST', S3_SSL_URL, t, {'name': name, 'certificate': full, 'private_key': key})
    new_id = (created or {}).get('id')
    log(f'Загружен {name} (id {new_id}), жду проверки…')
    status = '?'
    for _ in range(40):
        time.sleep(15)
        mine = [c for c in items(request('GET', S3_SSL_URL, t)) if c.get('id') == new_id or c.get('name') == name]
        status = (mine[0].get('badge_status') or mine[0].get('status') or '?') if mine else 'нет в списке'
        if str(status).lower() == 'active':
            break
        if str(status).lower() in ('error', 'failed'):
            fail(f'S3 не принял сертификат: {status}')
    if str(status).lower() != 'active':
        fail(f'Сертификат не стал активным за 10 минут (статус {status})')
    log('Новый сертификат активен')

    # 5. Старые сертификаты домена больше не нужны
    for c in s3:
        if c.get('id') and c.get('id') != new_id:
            request('DELETE', f"{S3_SSL_URL}/{c['id']}", t)
            log(f"Удалён старый {c.get('name')}")


if __name__ == '__main__':
    main()
