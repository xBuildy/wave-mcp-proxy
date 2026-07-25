# Set location to the script directory (extension root)
cd $PSScriptRoot

# Run npm installation
npm install

# Run the extension build command
npm run build

# Package the extension into a .vsix file
npx vsce package --no-yarn

# Copy the generated .vsix file to the user's Desktop
Copy-Item *.vsix "$env:USERPROFILE\Desktop" -Force

# Confirm completion
Write-Host 'Built and copied to Desktop'
