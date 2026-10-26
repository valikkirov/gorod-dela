"""Копирует сертификат Let's Encrypt из Менеджера сертификатов Selectel в Yandex Certificate Manager.

Зачем: gorod-dela.ru (без www) обслуживает бакет Yandex «gorod-dela.ru», который переадресует на
www.gorod-dela.ru. Сертификат Selectel покрывает оба имени и продлевается сам; Yandex получает копию
раз в неделю (.github/workflows/cert.yml). Бакет привязан к сертификату «gorod-dela-sync» один раз
в консоли, а обновление сертификата по тому же id подхватывается бакетом без перепривязки.

Переменные окружения:
  SEL_USER, SEL_PASSWORD, SEL_ACCOUNT, SEL_PROJECT — как у renew_s3_cert.py
  YC_KEY       — авторизованный ключ сервисного аккаунта Yandex (JSON, секрет GitHub)
  YC_FOLDER    — каталог Yandex, где лежит сертификат
  CERT_DOMAIN  — домен, по которому ищется сертификат в Selectel (gorod-dela.ru)
  FORCE=1      — загрузить, даже если в Yandex срок не меньше

Приватный ключ никуда не печатается.
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime

import jwt  # PyJWT, ставится в шаге workflow

from renew_s3_cert import CM_URL, fail, find_pem, items, log, parse_date, pem_expiry, request, to_pkcs8, token

IAM_URL = 'https://iam.api.cloud.yandex.net/iam/v1/tokens'
YC_CM = 'https://certificate-manager.api.cloud.yandex.net/certificate-manager/v1'
OPS = 'https://operation.api.cloud.yandex.net/operations'
CERT_NAME = 'gorod-dela-sync'


def yc_request(method: str, url: str, iam: str | None = None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if iam:
        req.add_header('Authorization', f'Bearer {iam}')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            payload = r.read()
            return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as e:
        fail(f'Yandex {method} {url} → {e.code}: {e.read().decode(errors="replace")[:500]}')


def yc_iam() -> str:
    key = json.loads(os.environ['YC_KEY'])
    now = int(time.time())
    token_jwt = jwt.encode(
        {'aud': IAM_URL, 'iss': key['service_account_id'], 'iat': now, 'exp': now + 600},
        key['private_key'],
        algorithm='PS256',
        headers={'kid': key['id']},
    )
    iam = yc_request('POST', IAM_URL, body={'jwt': token_jwt})['iamToken']
    print(f'::add-mask::{iam}')
    return iam


def wait(op: dict, iam: str) -> None:
    for _ in range(40):
        if op.get('done'):
            if op.get('error'):
                fail(f'Yandex: операция завершилась с ошибкой: {op["error"]}')
            return
        time.sleep(5)
        op = yc_request('GET', f'{OPS}/{op["id"]}', iam)
    fail('Yandex: операция не завершилась за 200 секунд')


def selectel_cert(domain: str) -> tuple[str, str, datetime]:
    """Самый свежий сертификат Selectel для домена: цепочка, ключ, срок"""
    t = token()
    certs = items(request('GET', f'{CM_URL}/certs', t))
    mine = [c for c in certs if domain in (c.get('dns_names') or c.get('domains') or [])]
    if not mine:
        fail(f'В Менеджере сертификатов Selectel нет сертификата для {domain}')
    metas = [request('GET', f'{CM_URL}/cert/{c["id"]}', t) for c in mine if c.get('id')]
    metas = [m for m in metas if isinstance(m, dict) and parse_date((m.get('validity') or {}).get('notAfter'))]
    meta = max(metas, key=lambda m: parse_date(m['validity']['notAfter']))
    full = find_pem(request('GET', f'{CM_URL}/cert/{meta["id"]}/ca_chain', t), 'BEGIN CERTIFICATE')
    key = find_pem(request('GET', f'{CM_URL}/cert/{meta["id"]}/private_key', t), 'PRIVATE KEY')
    if not full or not key:
        fail('Не нашёл файлы сертификата Selectel')
    for line in key.strip().splitlines():
        if line and 'PRIVATE KEY' not in line:
            print(f'::add-mask::{line.strip()}')
    return full.strip(), to_pkcs8(key.strip()), pem_expiry(full)


def main() -> None:
    domain = os.environ.get('CERT_DOMAIN', 'gorod-dela.ru')
    folder = os.environ['YC_FOLDER']
    force = os.environ.get('FORCE') == '1'
    chain, key, new_end = selectel_cert(domain)
    log(f'Yandex: свежий сертификат Selectel для {domain} действует до {new_end:%d.%m.%Y}')

    iam = yc_iam()
    listed = yc_request('GET', f'{YC_CM}/certificates?folderId={folder}&pageSize=100', iam).get('certificates', [])
    current = next((c for c in listed if c.get('name') == CERT_NAME), None)
    if current:
        cur_end = parse_date(current.get('notAfter'))
        if not force and cur_end and new_end <= cur_end:
            log(f'Yandex: уже стоит сертификат до {cur_end:%d.%m.%Y} — ничего не делаю')
            return
        op = yc_request(
            'PATCH',
            f'{YC_CM}/certificates/{current["id"]}',
            iam,
            {'updateMask': 'chain,privateKey', 'chain': chain, 'privateKey': key},
        )
        wait(op, iam)
        log(f'Yandex: сертификат {CERT_NAME} обновлён')
    else:
        op = yc_request(
            'POST',
            f'{YC_CM}/certificates',
            iam,
            {
                'folderId': folder,
                'name': CERT_NAME,
                'description': 'Копия сертификата Selectel для gorod-dela.ru (scripts/sync_yc_cert.py)',
                'chain': chain,
                'privateKey': key,
            },
        )
        wait(op, iam)
        log(f'Yandex: сертификат {CERT_NAME} создан — привяжи его к бакету gorod-dela.ru (HTTPS)')


if __name__ == '__main__':
    main()
