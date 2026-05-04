# 📱 Orbitask — Guia de Configuração WhatsApp (Evolution API)

Este guia detalha como conectar o Orbitask ao WhatsApp via **Evolution API** (self-hosted, gratuita).

---

## Pré-requisitos

- Orbitask rodando via Docker Compose
- Um número de WhatsApp dedicado (recomendado: chip separado ou número virtual)
- Acesso à VPS via SSH ou navegador

---

## 1. Verificar se a Evolution API está rodando

```bash
docker compose ps evolution
# Status deve ser: Up
```

Acesse: `http://seu-ip:8080`

Você verá a documentação Swagger da API.

---

## 2. Criar uma instância

```bash
# Substitua SUA_API_KEY pelo valor em EVOLUTION_API_KEY do .env
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "orbitask",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

Resposta esperada:
```json
{
  "instance": {
    "instanceName": "orbitask",
    "status": "created"
  }
}
```

---

## 3. Obter o QR Code

```bash
curl http://localhost:8080/instance/connect/orbitask \
  -H "apikey: SUA_API_KEY"
```

Resposta:
```json
{
  "code": "2@ABC123...",
  "base64": "data:image/png;base64,..."
}
```

### Via navegador (mais fácil):

1. Acesse: `http://seu-ip:8080/manager`
2. Faça login com a API key
3. Clique na instância **orbitask**
4. Escaneie o QR Code com o WhatsApp do número dedicado

---

## 4. Verificar conexão

```bash
curl http://localhost:8080/instance/fetchInstances \
  -H "apikey: SUA_API_KEY"
```

Procure por:
```json
{
  "instance": {
    "instanceName": "orbitask",
    "status": "open"   ← deve ser "open"
  }
}
```

No Orbitask Admin: `GET /admin/whatsapp/status` → `{ "connected": true }`

---

## 5. Testar envio manual

```bash
curl -X POST http://localhost:8080/message/sendText/orbitask \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5511999999999",
    "text": "🚀 Teste Orbitask — WhatsApp conectado com sucesso!"
  }'
```

---

## 6. Configurar webhook (obrigatório para o CRM receber respostas)

O CRM só consegue exibir as respostas dos leads no chat se a Evolution API
encaminhar o evento `messages.upsert` para o backend Orbitask.

A URL precisa incluir o `secret` (valor da env `CRM_WEBHOOK_SECRET` no backend)
como query param — sem ele a rota retorna 401.

```bash
curl -X POST http://localhost:8080/webhook/set/orbitask \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://seu-dominio.com/crm/webhook/whatsapp?secret=SEU_CRM_WEBHOOK_SECRET",
    "webhook_by_events": false,
    "events": ["MESSAGES_UPSERT"]
  }'
```

> Use `webhook_by_events: false` para que todos os eventos batem na mesma URL
> (a rota `/crm/webhook/whatsapp` filtra internamente por `event === 'messages.upsert'`).

---

## 7. Manter a sessão ativa

A sessão do WhatsApp pode expirar. Para reconectar automaticamente:

```bash
# Adicione ao crontab (verificação a cada 15 min)
*/15 * * * * /opt/orbitask/scripts/check-whatsapp.sh
```

Crie `/opt/orbitask/scripts/check-whatsapp.sh`:
```bash
#!/bin/bash
STATUS=$(curl -sf http://localhost:3333/admin/whatsapp/status \
  -H "Authorization: Bearer $ADMIN_TOKEN" | grep -o '"connected":true' || echo "")

if [[ -z "$STATUS" ]]; then
  echo "[$(date)] WhatsApp desconectado — tentando reconectar..."
  curl -X DELETE http://localhost:8080/instance/logout/orbitask \
    -H "apikey: $EVOLUTION_API_KEY" 2>/dev/null || true
  # Reconexão manual necessária — enviar alerta por email
fi
```

---

## 8. Formato dos números

O Orbitask remove automaticamente caracteres não numéricos. Use sempre o formato:

| Formato aceito     | Será enviado como |
|--------------------|-------------------|
| `+55 11 9 9999-9999` | `5511999999999`  |
| `(11) 99999-9999`  | `11999999999` ⚠️  |
| `+5511999999999`   | `5511999999999` ✅ |

> **Atenção:** sempre inclua o código do país (`55` para Brasil) e o dígito 9.

---

## 9. Limites e boas práticas

- **Evite spam**: o WhatsApp pode banir números que enviam mensagens em massa
- **Use número dedicado**: nunca use seu número pessoal principal
- **Intervalo mínimo**: o `WhatsAppService.ts` já inclui `delay: 1000ms` entre mensagens
- **Alertas de 2h**: configurados no cron — certifique-se de que os usuários esperem os alertas

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| QR Code expirou | `DELETE /instance/logout/orbitask` e reconectar |
| Status "connecting" | Aguardar até 60s após escanear |
| Mensagens não chegam | Verificar `phoneWhatsapp` dos usuários no Admin |
| `connected: false` | Verificar `EVOLUTION_API_KEY` no `.env` |
| Container não inicia | `docker compose logs evolution` |

---

## Variáveis de ambiente relevantes

```env
EVOLUTION_API_URL=http://localhost:8080    # URL da Evolution API
EVOLUTION_API_KEY=your-secret-key          # Chave de autenticação
EVOLUTION_INSTANCE=orbitask                # Nome da instância criada
```

---

## Links úteis

- [Evolution API Docs](https://doc.evolution-api.com)
- [Evolution API GitHub](https://github.com/EvolutionAPI/evolution-api)
- [WhatsApp Business Policy](https://www.whatsapp.com/legal/business-policy)

