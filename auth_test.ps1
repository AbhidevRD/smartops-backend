Write-Host "Step 1: Signup" -ForegroundColor Cyan
$body = @{
    name = "Dev User 2"
    email = "devuser2@test.com"
    password = "TestPass123"
} | ConvertTo-Json

$resp = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/signup" -Method Post -ContentType "application/json" -Body $body
$data = $resp.Content | ConvertFrom-Json
Write-Host "Response: $($resp.Content)"
$otp1 = $data.otp
Write-Host "OTP: $otp1" -ForegroundColor Green

Write-Host "`nStep 2: Verify OTP" -ForegroundColor Cyan
$verifyBody = @{
    email = "devuser2@test.com"
    otp = $otp1
} | ConvertTo-Json

$verifyResp = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/verify-otp" -Method Post -ContentType "application/json" -Body $verifyBody
Write-Host "Verify Response: $($verifyResp.Content)"

Write-Host "`nStep 3: Login" -ForegroundColor Cyan
$loginBody = @{
    email = "devuser2@test.com"
    password = "TestPass123"
} | ConvertTo-Json

$loginResp = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
$loginData = $loginResp.Content | ConvertFrom-Json
Write-Host "Login Response: $($loginResp.Content)"
$jwtToken = $loginData.token
Write-Host "JWT Token: $jwtToken" -ForegroundColor Green

Write-Host "`nStep 4: Forgot Password" -ForegroundColor Cyan
$forgotBody = @{
    email = "devuser2@test.com"
} | ConvertTo-Json

$forgotResp = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/forgot-password" -Method Post -ContentType "application/json" -Body $forgotBody
$forgotData = $forgotResp.Content | ConvertFrom-Json
Write-Host "Forgot Password Response: $($forgotResp.Content)"
$resetOtp = $forgotData.otp
Write-Host "Reset OTP: $resetOtp" -ForegroundColor Green

Write-Host "`nStep 5: Reset Password" -ForegroundColor Cyan
$resetBody = @{
    email = "devuser2@test.com"
    otp = $resetOtp
    password = "NewPass123"
} | ConvertTo-Json

$resetResp = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/reset-password" -Method Post -ContentType "application/json" -Body $resetBody
Write-Host "Reset Password Response: $($resetResp.Content)"

Write-Host "`nStep 6: Login with New Password" -ForegroundColor Cyan
$newLoginBody = @{
    email = "devuser2@test.com"
    password = "NewPass123"
} | ConvertTo-Json

$newLoginResp = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" -Method Post -ContentType "application/json" -Body $newLoginBody
$newLoginData = $newLoginResp.Content | ConvertFrom-Json
Write-Host "New Login Response: $($newLoginResp.Content)"
$finalToken = $newLoginData.token
Write-Host "`nFinal JWT Token: $finalToken" -ForegroundColor Yellow
