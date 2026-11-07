# Coolify does not keep the repo checkout on the server, so nginx.conf is baked in.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
