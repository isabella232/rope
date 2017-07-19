FROM mhart/alpine-node:base-8

WORKDIR .
ADD . .

EXPOSE 8080

CMD ["node", "rope.js"]
