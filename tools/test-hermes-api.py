import requests
import json

url = "http://127.0.0.1:8083/v1/chat/completions"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer echora-shared-secret"
}
body = {
    "model": "hermes-agent",
    "messages": [{"role": "user", "content": "say hi in 5 words"}],
    "stream": False,
    "max_tokens": 50
}

try:
    resp = requests.post(url, headers=headers, json=body, timeout=30)
    print(f"Status: {resp.status_code}")
    print(f"Headers: {dict(resp.headers)}")
    data = resp.json()
    if "error" in data:
        print(f"Error: {data['error']}")
    elif "choices" in data:
        print(f"Model: {data.get('model', 'N/A')}")
        print(f"Content: {data['choices'][0]['message']['content']}")
        print(f"Session-Id: {resp.headers.get('x-hermes-session-id', 'N/A')}")
    else:
        print(f"Response: {json.dumps(data, indent=2)[:500]}")
except Exception as e:
    print(f"Exception: {e}")
