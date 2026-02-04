#!/bin/bash
# Generate GitHub Secrets for CodeMoss release workflow
# Run this script and it will output the values you need to add to GitHub Secrets

set -e

echo "=========================================="
echo "CodeMoss GitHub Secrets Generator"
echo "=========================================="
echo ""

# Configuration
CERT_NAME="Developer ID Application: kunpeng zhu (RLHBM56QRH)"
P8_FILE="$HOME/Desktop/苹果开发者证书/AuthKey_26H3LYD74W.p8"
OUTPUT_DIR="$HOME/.codemoss-secrets"
P12_FILE="$OUTPUT_DIR/certificate.p12"

mkdir -p "$OUTPUT_DIR"

echo "Step 1: Export certificate to .p12 file"
echo "----------------------------------------"
echo "Please enter a password for the .p12 file (you'll need this for APPLE_CERTIFICATE_PASSWORD):"
read -s P12_PASSWORD
echo ""

# Export certificate from keychain
security export -k ~/Library/Keychains/login.keychain-db -t identities -f pkcs12 -o "$P12_FILE" -P "$P12_PASSWORD" 2>/dev/null || {
    echo "Trying alternative export method..."
    security find-identity -v -p codesigning | grep "Developer ID Application"
    echo ""
    echo "Please export the certificate manually:"
    echo "1. Open Keychain Access"
    echo "2. Find 'Developer ID Application: kunpeng zhu'"
    echo "3. Right-click -> Export..."
    echo "4. Save as .p12 to: $P12_FILE"
    echo "5. Re-run this script"
    exit 1
}

echo ""
echo "Step 2: Generating Base64 values..."
echo "----------------------------------------"
echo ""

# Generate Base64 for certificate
CERT_B64=$(base64 -i "$P12_FILE")

# Generate Base64 for .p8 key
if [ -f "$P8_FILE" ]; then
    P8_B64=$(base64 -i "$P8_FILE")
else
    echo "Error: .p8 file not found at $P8_FILE"
    exit 1
fi

# Extract Key ID from filename
KEY_ID=$(basename "$P8_FILE" | sed 's/AuthKey_//' | sed 's/.p8//')

echo ""
echo "=========================================="
echo "GitHub Secrets Values"
echo "=========================================="
echo ""
echo "Copy these values to GitHub -> Settings -> Secrets and variables -> Actions"
echo ""
echo "-------------------------------------------"
echo "APPLE_CERTIFICATE_PASSWORD:"
echo "-------------------------------------------"
echo "$P12_PASSWORD"
echo ""
echo "-------------------------------------------"
echo "APPLE_CERTIFICATE_P12 (Base64):"
echo "-------------------------------------------"
echo "$CERT_B64"
echo ""
echo "-------------------------------------------"
echo "APPLE_API_KEY_ID:"
echo "-------------------------------------------"
echo "$KEY_ID"
echo ""
echo "-------------------------------------------"
echo "APPLE_API_PRIVATE_KEY_B64 (Base64):"
echo "-------------------------------------------"
echo "$P8_B64"
echo ""
echo "-------------------------------------------"
echo "APPLE_API_ISSUER_ID:"
echo "-------------------------------------------"
echo "Get this from App Store Connect -> Users and Access -> Keys"
echo "It's the 'Issuer ID' shown at the top of the API Keys page"
echo ""

# Save to files for easier copy
echo "$CERT_B64" > "$OUTPUT_DIR/APPLE_CERTIFICATE_P12.txt"
echo "$P8_B64" > "$OUTPUT_DIR/APPLE_API_PRIVATE_KEY_B64.txt"
echo "$P12_PASSWORD" > "$OUTPUT_DIR/APPLE_CERTIFICATE_PASSWORD.txt"
echo "$KEY_ID" > "$OUTPUT_DIR/APPLE_API_KEY_ID.txt"

echo "=========================================="
echo "GitHub Variables (non-sensitive)"
echo "=========================================="
echo ""
echo "CODESIGN_IDENTITY:"
echo "Developer ID Application: kunpeng zhu (RLHBM56QRH)"
echo ""
echo "NOTARY_PROFILE_NAME:"
echo "CodeMoss-Notarize"
echo ""
echo "APPLE_TEAM_ID:"
echo "RLHBM56QRH"
echo ""

echo "=========================================="
echo "Files saved to: $OUTPUT_DIR"
echo "=========================================="
echo ""
echo "For easier copying, the Base64 values are saved to:"
echo "  - $OUTPUT_DIR/APPLE_CERTIFICATE_P12.txt"
echo "  - $OUTPUT_DIR/APPLE_API_PRIVATE_KEY_B64.txt"
echo "  - $OUTPUT_DIR/APPLE_CERTIFICATE_PASSWORD.txt"
echo "  - $OUTPUT_DIR/APPLE_API_KEY_ID.txt"
echo ""
echo "IMPORTANT: Delete these files after you've added the secrets to GitHub!"
echo "  rm -rf $OUTPUT_DIR"
