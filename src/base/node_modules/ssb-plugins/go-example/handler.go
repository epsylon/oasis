package main

import (
	"context"
	"fmt"
	"log"

	"github.com/pkg/errors"
	"go.cryptoscope.co/muxrpc"
)

type exampleHandler struct{}

func (h exampleHandler) HandleCall(ctx context.Context, req *muxrpc.Request, edp muxrpc.Endpoint) {
	log.Printf("got called: M:%v Args:%v", req.Method, req.Args)
	if len(req.Method) != 1 {
		req.Stream.CloseWithError(errors.New("expected len 1 method"))
		return
	}

	req.Type = "async" // TOOD: hack - this needs to be moved into muxrpc with the manifest

	switch m := req.Method[0]; m {
	case "hello":
		err := req.Return(ctx, fmt.Sprintf("hello %s", req.Args[0]))
		if err != nil {
			log.Fatal(errors.Wrap(err, "returning hello failed"))
		}

	case "callback":
		type jsonm map[string]interface{}
		foo, err := edp.Async(ctx, jsonm{}, muxrpc.Method{"callback"}, req.Args)
		if err != nil {
			log.Fatal(errors.Wrap(err, "calling back failed"))
			return
		}
		log.Println("got result:", foo)
		err = req.Return(ctx, foo)
		if err != nil {
			log.Fatal(errors.Wrap(err, "returning result failed"))
		}

	default:
		req.Stream.CloseWithError(errors.Errorf("undefined method: %s", m))
	}
}

func (h exampleHandler) HandleConnect(ctx context.Context, e muxrpc.Endpoint) {
	log.Printf("ex handler running")
	// use endpoint to check for methods and do setup
}
