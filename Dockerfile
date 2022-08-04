FROM balena/open-balena-base:v13.3.2
# FROM balenalib/%%BALENA_MACHINE_NAME%%-node:16-run
# FROM balenalib/fincm3-ubuntu:bionic
# FROM balenalib/fincm3-node:16-run

WORKDIR /usr/src/app

COPY ./package.json /usr/src/app/package.json
COPY ./package-lock.json /usr/src/app/package-lock.json
RUN npm ci

COPY ./tsconfig.json /usr/src/app/tsconfig.json
COPY ./tsconfig.build.json /usr/src/app/tsconfig.build.json

COPY ./lib/ /usr/src/app/lib/
RUN npm run build

CMD [ "npm", "start" ]
