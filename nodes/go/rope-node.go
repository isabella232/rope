package main

import (
  "os"
	"github.com/koding/kite"
)

func main() {
	r := kite.New("dope", "0.0.0")
	r.Config.Environment = "Go"

	// r.SetLogLevel(kite.DEBUG)

	kiteURL := os.Getenv("ROPEHOST")
	if kiteURL == "" {
		kiteURL = "http://rope.live:8080"
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
			kiteId := req.Args.One().MustString()
			r.Log.Info("Identified as %v now!", kiteId)
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
