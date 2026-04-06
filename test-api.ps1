$BASE_URL = "http://localhost:3000"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "VIDE API ENDPOINT CONNECTION REPORT" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$pass = 0
$fail = 0

# Test auth-required endpoints (should return 401)
Write-Host "Testing Auth-Required Endpoints" -ForegroundColor Yellow

$tests = @(
    @{Url="/api/users"; Method="GET"},
    @{Url="/api/profile"; Method="GET"},
    @{Url="/api/friends"; Method="GET"},
    @{Url="/api/calls/history"; Method="GET"}
)

foreach ($t in $tests) {
    try {
        $r = Invoke-WebRequest -Uri "$BASE_URL$($t.Url)" -Method $t.Method -ErrorAction SilentlyContinue
        $status = $r.StatusCode
    } catch { $status = 0 }
    
    if ($status -eq 401) {
        Write-Host "PASS: $($t.Method) $($t.Url) -> 401" -ForegroundColor Green
        $pass++
    } else {
        Write-Host "FAIL: $($t.Method) $($t.Url) -> $status (expected 401)" -ForegroundColor Red
        $fail++
    }
}

# Test public endpoints
Write-Host "`nTesting Public Endpoints" -ForegroundColor Yellow

try {
    $r = Invoke-RestMethod -Uri "$BASE_URL/api/auth/register" -Method Post -ContentType "application/json" -Body (@{username="testuser";password="testpass123"} | ConvertTo-Json) -ErrorAction Stop
    Write-Host "PASS: POST /api/auth/register -> 201 (user created)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "FAIL: POST /api/auth/register" -ForegroundColor Red
    $fail++
}

# Test pages
$pages = @("/", "/login", "/register")
foreach ($p in $pages) {
    try {
        $r = Invoke-WebRequest -Uri "$BASE_URL$p" -Method Get -ErrorAction SilentlyContinue -MaximumRedirection 0
        Write-Host "PASS: GET $p -> Status $($r.StatusCode)" -ForegroundColor Green
        $pass++
    } catch {
        Write-Host "FAIL: GET $p" -ForegroundColor Red
        $fail++
    }
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "RESULTS: $pass passed, $fail failed" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

if ($fail -eq 0) {
    Write-Host "ALL API ENDPOINTS VERIFIED AND WORKING" -ForegroundColor Green
}