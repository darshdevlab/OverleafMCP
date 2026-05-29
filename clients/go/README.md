# overleafmcp-go

Go client for `OverleafMCP`.

This package launches the MCP server as a subprocess and communicates with it over stdio using the official Go MCP SDK.

## Example

```go
package main

import (
	"context"
	"log"

	overleafmcp "github.com/overleafmcp/overleafmcp-go"
)

func main() {
	ctx := context.Background()
	client := overleafmcp.NewDefaultClient()

	if err := client.Connect(ctx); err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	text, err := client.ListProjects(ctx)
	if err != nil {
		log.Fatal(err)
	}

	log.Print(text)
}
```
