# HCU plugin image. Must be linux/arm64 and carry the metadata label.
FROM --platform=linux/arm64 ghcr.io/homematicip/alpine-node-simple:0.0.1

WORKDIR /app

COPY package.json .npmrc ./
COPY package-lock.jso[n] ./
RUN npm install --omit=dev --no-audit --no-fund --loglevel=error

COPY src ./src

# /data is created by the HCU for installed plugins and persists across
# container updates. We write the editable config there.
VOLUME ["/data"]

ENV NODE_ENV=production \
    HMIP_PLUGIN_ID=de.homematicip.plugin.gardena \
    LOG_LEVEL=info

ENTRYPOINT ["node", "src/index.js"]

LABEL de.eq3.hmip.plugin.metadata="{\"pluginId\":\"de.homematicip.plugin.gardena\",\"issuer\":\"Fabio Renner\",\"version\":\"1.1.0\",\"hcuMinVersion\":\"1.4.7\",\"scope\":\"CLOUD\",\"friendlyName\":{\"de\":\"Gardena smart system\",\"en\":\"Gardena smart system\"},\"description\":{\"de\":\"Bindet Gardena smart Geraete (Maeher, Ventile, Steckdosen, Sensoren) in Homematic IP ein. GitHub: https://github.com/fabiorenner-hub/hmip-hcu-gardena - Spenden via PayPal: https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C\",\"en\":\"Bridges Gardena smart system devices (mowers, valves, power sockets, sensors) into Homematic IP. GitHub: https://github.com/fabiorenner-hub/hmip-hcu-gardena - Donate via PayPal: https://www.paypal.com/donate/?hosted_button_id=JPZRATUUHRT5C\"},\"settings\":[],\"changelog\":\"1.1.0 - Plugin icon, GitHub link and PayPal donation hint added to plugin metadata, README and HCU description.\\n1.0.0 - Initial public release.\",\"logsEnabled\":true}"
