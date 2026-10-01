package main

import (
	"context"
	"io"
	"log"
	"os"

	"go.cryptoscope.co/muxrpc"
)

type rwc struct {
	io.Reader
	io.WriteCloser
}

func main() {
	log.Println("go oop plugin started")

	var conn io.ReadWriteCloser = rwc{os.Stdin, os.Stdout}
	pkr := muxrpc.NewPacker(conn)

	h := exampleHandler{}
	edp := muxrpc.Handle(pkr, h)

	srv := edp.(muxrpc.Server)
	ctx := context.Background()
	err := srv.Serve(ctx)
	if err != nil {
		log.Fatal(err)
	}
}
