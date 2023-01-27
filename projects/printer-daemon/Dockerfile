FROM node:latest

RUN apt-get update
RUN apt-get upgrade -y
RUN apt-get install -y libglib2.0-dev libdbus-1-dev bluez dbus sudo libpixman-1-dev libcairo2-dev libpango1.0-dev

# Setup bluetooth permissions

COPY bluezuser.conf /etc/dbus-1/system.d/
RUN useradd -m bluezuser \
 && adduser bluezuser sudo \
 && passwd -d bluezuser
USER bluezuser

# Setup arguments

ARG http_port=3000
ENV http_port ${http_port}


# Setup and build application

WORKDIR /app
COPY src .
COPY package.json .

RUN npm install --only=production

COPY entrypoint.sh .

ENTRYPOINT [ "./entrypoint.sh" ]