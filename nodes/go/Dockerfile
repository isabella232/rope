FROM golang:latest

RUN mkdir -p /go/src/rope-node
ADD . /go/src/rope-node/
WORKDIR /go/src/rope-node

RUN go get
RUN go build

ENTRYPOINT ["/go/bin/rope-node"]
