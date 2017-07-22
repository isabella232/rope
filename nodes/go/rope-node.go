package main

import (
	"github.com/koding/kite"
	"os"
	"runtime"
)

func main() {
	r := kite.New("dope", "0.0.0")
	r.Config.Environment = runtime.Version()

	kiteURL := os.Getenv("ROPEHOST")
	if kiteURL == "" {
		kiteURL = "https://secure.rope.live"
	}
	l := r.NewClient(kiteURL)
	l.Reconnect = true

	api := map[string]kite.HandlerFunc{
		"square": func(req *kite.Request) (interface{}, error) {
			number := req.Args.One().MustFloat64()
			result := number * number
			return result, nil
		},
		"identified": func(req *kite.Request) (interface{}, error) {
			var args struct {
				Id string `json:"id"`
			}
			req.Args.One().MustUnmarshal(&args)
			r.Log.Info("Identified as %v now!", args.Id)
			return nil, nil
		},
	}

	for method, f := range api {
		r.HandleFunc(method, f)
	}

	r.HandleFunc("identify", func(req *kite.Request) (interface{}, error) {
		r.Log.Info("Identify requested!")
		funcs := make([]string, 0, len(api))
		for method := range api {
			funcs = append(funcs, method)
		}
		return map[string]interface{}{
			"kiteInfo": r.Kite(),
			"api":      funcs,
		}, nil
	})

	connection, err := l.DialForever()
	if err != nil {
		r.Log.Fatal(err.Error())
	}
	<-connection

	r.Run()
}
