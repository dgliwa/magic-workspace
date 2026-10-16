#!/usr/bin/env python3
import json
import sys
import urllib.error
import urllib.request

API = "https://api2.moxfield.com"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0"


def request_json(path, method="GET", headers=None, body=None):
    request_headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://moxfield.com",
        "Referer": "https://moxfield.com/",
    }
    request_headers.update(headers or {})
    request = urllib.request.Request(
        API + path,
        data=body,
        headers=request_headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        error.read()
        raise RuntimeError(f"Moxfield request failed with HTTP {error.code}.") from None


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    payload = json.load(sys.stdin)
    credential = str(payload.get("credential") or "").strip()
    if not credential or "\r" in credential or "\n" in credential:
        raise ValueError("A single-line Moxfield credential is required.")

    if mode == "cookie":
        result = request_json(
            "/v1/startup/authenticated",
            method="POST",
            headers={"Cookie": credential, "Content-Type": "application/json"},
            body=b"{}",
        )
    elif mode == "bearer":
        result = request_json(
            "/v3/decks",
            headers={"Authorization": f"Bearer {credential}"},
        )
    else:
        raise ValueError("Unknown Moxfield account helper mode.")

    json.dump(result, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
