import os
from dotenv import load_dotenv
load_dotenv()

key = os.getenv("GEMINI_API_KEY")
from google import genai
client = genai.Client(api_key=key)

print("Listing supported models:")
for m in client.models.list():
    if "flash" in m.name.lower() or "gemini" in m.name.lower():
        print("Model:", m.name)

# Test with gemini-2.5-flash or available model
model_name = "gemini-2.5-flash"
try:
    resp = client.models.generate_content(model=model_name, contents="Ola, teste de conexao do ARGOS. Responda 'CONECTADO'.")
    print(f"Sucesso com {model_name}:", resp.text.strip())
except Exception as e:
    print(f"Erro com {model_name}:", e)
