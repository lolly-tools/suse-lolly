# SPDX-License-Identifier: MPL-2.0
# lolly.ing instance image: the Work server built at WSHA plus the signed SUSE
# shell and the pack, at the paths Work reads today (instance.shellDir and
# instance.pack). Built only by .github/workflows/lolly-ing-preview.yml, from a
# Work server image that job loaded locally; nothing is pulled and nothing is
# pushed. The files keep the modes the workflow gave them (directories 0755,
# files 0644) and are owned by root, so the server's node user can read but not
# change them. The engine pin is the Work image's own /app/engine-pin.json.
ARG WORK_SERVER_IMAGE
FROM ${WORK_SERVER_IMAGE}
# One COPY, so one layer: the build context's app/ holds shell/ and packs/lolly-ing/,
# and the workflow hard-links their identical files, which a single layer stores once.
COPY --chown=0:0 app/ /app/
ARG LOLLY_SOURCE
ARG WORK_SOURCE
ARG SUSE_SOURCE
ARG RUN_URL
LABEL org.opencontainers.image.title="lolly-ing-instance" \
      org.opencontainers.image.revision="${WORK_SOURCE}" \
      tools.lolly.lolly-source="${LOLLY_SOURCE}" \
      tools.lolly.work-source="${WORK_SOURCE}" \
      tools.lolly.suse-source="${SUSE_SOURCE}" \
      tools.lolly.build-run="${RUN_URL}"
