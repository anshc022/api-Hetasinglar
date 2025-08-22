# PowerShell script to remove .env file from repository after deployment
# Run this after successful deployment to make repository public-ready

Write-Host "🔐 Removing .env file from repository for public release..." -ForegroundColor Blue

# Remove .env from git tracking
git rm --cached .env

# Read current .gitignore content
$gitignoreContent = Get-Content .gitignore

# Update .gitignore to ignore .env files
$newContent = @()

foreach ($line in $gitignoreContent) {
    if ($line -match "temporarily allowing .env for deployment - remove after deployment") {
        $newContent += "# Environment variables"
        $newContent += ".env"
    } else {
        $newContent += $line
    }
}

# Write updated content back to .gitignore
$newContent | Set-Content .gitignore

# Commit the changes
git add .gitignore
git commit -m "Remove .env file from repository for public release"

Write-Host "✅ .env file removed from git tracking" -ForegroundColor Green
Write-Host "📝 .gitignore updated to ignore environment files" -ForegroundColor Green
Write-Host "🚀 Repository is now ready to be made public!" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Push changes: git push origin main" -ForegroundColor White
Write-Host "2. Make repository public on GitHub" -ForegroundColor White
Write-Host "3. Update any hardcoded secrets in the codebase" -ForegroundColor White
Write-Host "4. Verify no sensitive data is exposed" -ForegroundColor White
