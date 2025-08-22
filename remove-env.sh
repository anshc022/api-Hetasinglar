#!/bin/bash

# Script to remove .env file from repository after deployment
# Run this after successful deployment to make repository public-ready

echo "🔐 Removing .env file from repository for public release..."

# Remove .env from git tracking
git rm --cached .env

# Update .gitignore to ignore .env files
sed -i 's/# Environment variables (temporarily allowing .env for deployment - remove after deployment)/# Environment variables/' .gitignore
sed -i '2i\.env' .gitignore

# Commit the changes
git add .gitignore
git commit -m "Remove .env file from repository for public release"

echo "✅ .env file removed from git tracking"
echo "📝 .gitignore updated to ignore environment files"
echo "🚀 Repository is now ready to be made public!"

echo ""
echo "Next steps:"
echo "1. Push changes: git push origin main"
echo "2. Make repository public on GitHub"
echo "3. Update any hardcoded secrets in the codebase"
echo "4. Verify no sensitive data is exposed"
