param(
    [Parameter(Mandatory = $true)]
    [string]$ApiKey,

    [string]$BaseUrl = "http://localhost:8000"
)

$headers = @{
    "X-API-Key"    = $ApiKey
    "Content-Type" = "application/json"
}

Write-Host "=== ML Questions Gateway — Demo Smoke Test ===" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl`n"

# 1. Health check
Write-Host "[1/4] Health check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health"
    Write-Host "  OK - status: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "  FALHOU - servidor nao esta rodando?" -ForegroundColor Red
    exit 1
}

# 2. Create tenant
Write-Host "[2/4] Criar tenant de teste..." -ForegroundColor Yellow
try {
    $body = '{"name":"Demo Smoke Test"}'
    $tenant = Invoke-RestMethod -Uri "$BaseUrl/api/v1/tenants" -Method POST -Headers $headers -Body $body
    Write-Host "  OK - tenant: $($tenant.name) ($($tenant.id))" -ForegroundColor Green
    Write-Host "  Connect URL: $($tenant.connect_url)" -ForegroundColor Gray
} catch {
    Write-Host "  FALHOU - verifique GATEWAY_API_KEY" -ForegroundColor Red
    exit 1
}

# 3. List tenants
Write-Host "[3/4] Listar tenants..." -ForegroundColor Yellow
try {
    $tenants = Invoke-RestMethod -Uri "$BaseUrl/api/v1/tenants" -Headers $headers
    Write-Host "  OK - $($tenants.Count) tenant(s)" -ForegroundColor Green
} catch {
    Write-Host "  FALHOU" -ForegroundColor Red
    exit 1
}

# 4. List escalations
Write-Host "[4/4] Listar escalonamentos..." -ForegroundColor Yellow
try {
    $escalations = Invoke-RestMethod -Uri "$BaseUrl/api/v1/escalations" -Headers $headers
    Write-Host "  OK - $($escalations.Count) escalonamento(s)" -ForegroundColor Green
} catch {
    Write-Host "  FALHOU" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Smoke test concluido ===" -ForegroundColor Cyan
Write-Host "Proximos passos manuais:" -ForegroundColor White
Write-Host "  1. Abra $($tenant.connect_url) e autorize OAuth ML"
Write-Host "  2. Faca uma pergunta em um anuncio de teste"
Write-Host "  3. Verifique resposta automatica ou escalonamento em $BaseUrl/admin"
Write-Host "`nGuia completo: docs/DEPLOY-DEMO.md"
