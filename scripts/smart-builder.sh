#!/bin/bash
set -e

EXTENSIONS_FILE="custom/extensions.yml"
INSTALL_SCRIPT="custom/install.sh"

if [ -f "$EXTENSIONS_FILE" ]; then
    echo "Processing $EXTENSIONS_FILE..."

    # Install APT packages
    if [ -x "$(command -v yq)" ]; then
        APT_PACKAGES=$(yq '.apt[]' "$EXTENSIONS_FILE" 2>/dev/null | xargs)
        if [ -n "$APT_PACKAGES" ]; then
            echo "Installing APT packages: $APT_PACKAGES"
            sudo apt-get update && sudo apt-get install -y $APT_PACKAGES
        fi

        # Install NPM packages
        NPM_PACKAGES=$(yq '.npm[]' "$EXTENSIONS_FILE" 2>/dev/null | xargs)
        if [ -n "$NPM_PACKAGES" ]; then
             echo "Installing NPM packages: $NPM_PACKAGES"
             sudo npm install -g $NPM_PACKAGES
        fi

        # Install PIP packages
        PIP_PACKAGES=$(yq '.pip[]' "$EXTENSIONS_FILE" 2>/dev/null | xargs)
        if [ -n "$PIP_PACKAGES" ]; then
             echo "Installing PIP packages: $PIP_PACKAGES"
             pip3 install $PIP_PACKAGES --break-system-packages
        fi
    else
        echo "yq not found. Skipping YAML extension parsing. Please install yq or use custom/install.sh."
    fi
else
    echo "No $EXTENSIONS_FILE found."
fi

if [ -f "$INSTALL_SCRIPT" ]; then
    echo "Executing custom install script: $INSTALL_SCRIPT"
    chmod +x "$INSTALL_SCRIPT"
    ./"$INSTALL_SCRIPT"
else
    echo "No $INSTALL_SCRIPT found."
fi

echo "Smart build complete."
