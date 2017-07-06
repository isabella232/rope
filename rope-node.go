package main

import (
	"github.com/koding/kite"
)

func main() {
	r := kite.New("dope", "0.0.0")
	// r.SetLogLevel(kite.DEBUG)
	// r.Config.DisableAuthentication = true

	kiteURL := "ws://localhost:8080"
	l := r.NewClient(kiteURL)

	api := map[string]kite.HandlerFunc{
		"square": func(req *kite.Request) (interface{}, error) {
			number := req.Args.One().MustFloat64()
			result := number * number
			return result, nil
		},
		"identified": func(req *kite.Request) (interface{}, error) {
			res, err := l.Tell("query", nil)
			if err != nil {
				panic(err)
			}

			var kites []string
			if err := res.Unmarshal(&kites); err != nil {
				panic(err)
			}

			r.Log.Info("Following Kites found on Rope: %v\n", kites)
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

	err := l.Dial()
	if err != nil {
		r.Log.Fatal(err.Error())
	}
	r.Run()
}
