package overleafmcp

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type callSession interface {
	CallTool(context.Context, *mcp.CallToolParams) (*mcp.CallToolResult, error)
	Close()
}

type Client struct {
	command string
	args    []string
	env     []string
	session callSession
}

func NewClient(command string, args []string, env map[string]string) *Client {
	return &Client{
		command: command,
		args:    append([]string{}, args...),
		env:     mergeEnv(env),
	}
}

func NewDefaultClient() *Client {
	return NewClient("npx", []string{"-y", "@overleafmcp/server"}, nil)
}

func (c *Client) Connect(ctx context.Context) error {
	if c.session != nil {
		return nil
	}

	client := mcp.NewClient(&mcp.Implementation{Name: "overleafmcp-go", Version: "0.1.0"}, nil)
	command := exec.Command(c.command, c.args...)
	if len(c.env) > 0 {
		command.Env = c.env
	}

	session, err := client.Connect(ctx, &mcp.CommandTransport{Command: command}, nil)
	if err != nil {
		return err
	}

	c.session = session
	return nil
}

func (c *Client) Close() {
	if c.session != nil {
		c.session.Close()
		c.session = nil
	}
}

func (c *Client) CallToolText(ctx context.Context, name string, arguments map[string]any) (string, error) {
	if c.session == nil {
		return "", errors.New("client is not connected")
	}

	result, err := c.session.CallTool(ctx, &mcp.CallToolParams{
		Name:      name,
		Arguments: arguments,
	})
	if err != nil {
		return "", err
	}
	if result.IsError {
		return "", errors.New(extractText(result))
	}

	return extractText(result), nil
}

func (c *Client) CallToolJSON(ctx context.Context, name string, arguments map[string]any, out any) error {
	text, err := c.CallToolText(ctx, name, arguments)
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(text), out)
}

func (c *Client) ListProjects(ctx context.Context) (string, error) {
	return c.CallToolText(ctx, ToolListProjects, map[string]any{})
}

func (c *Client) ListTags(ctx context.Context) (string, error) {
	return c.CallToolText(ctx, ToolListTags, map[string]any{})
}

func (c *Client) CreateProject(ctx context.Context, name string, templateID string, tags []map[string]any) (string, error) {
	payload := map[string]any{
		"name": name,
		"tags": tags,
	}
	if templateID != "" {
		payload["templateId"] = templateID
	}
	return c.CallToolText(ctx, ToolCreateProject, payload)
}

func (c *Client) CreateTag(ctx context.Context, name string, color string) (string, error) {
	payload := map[string]any{
		"name": name,
	}
	if color != "" {
		payload["color"] = color
	}
	return c.CallToolText(ctx, ToolCreateTag, payload)
}

func (c *Client) EditTag(ctx context.Context, tagID string, name string, color string) (string, error) {
	payload := map[string]any{
		"tagId": tagID,
		"name":  name,
	}
	if color != "" {
		payload["color"] = color
	}
	return c.CallToolText(ctx, ToolEditTag, payload)
}

func (c *Client) DeleteTag(ctx context.Context, tagID string) (string, error) {
	return c.CallToolText(ctx, ToolDeleteTag, map[string]any{
		"tagId": tagID,
	})
}

func (c *Client) AssignProjectTags(ctx context.Context, projectID string, tags []map[string]any) (string, error) {
	return c.CallToolText(ctx, ToolAssignProjectTags, map[string]any{
		"projectId": projectID,
		"tags":      tags,
	})
}

func (c *Client) RemoveProjectTags(ctx context.Context, projectID string, tagIDs []string, tagNames []string) (string, error) {
	payload := map[string]any{
		"projectId": projectID,
	}
	if len(tagIDs) > 0 {
		payload["tagIds"] = tagIDs
	}
	if len(tagNames) > 0 {
		payload["tagNames"] = tagNames
	}
	return c.CallToolText(ctx, ToolRemoveProjectTags, payload)
}

func (c *Client) DeleteProject(ctx context.Context, projectID string) (string, error) {
	return c.CallToolText(ctx, ToolDeleteProject, map[string]any{
		"projectId": projectID,
	})
}

func (c *Client) CreateFile(ctx context.Context, projectID string, path string, content string) (string, error) {
	return c.CallToolText(ctx, ToolCreateFile, map[string]any{
		"projectId": projectID,
		"path":      path,
		"content":   content,
	})
}

func extractText(result *mcp.CallToolResult) string {
	parts := make([]string, 0, len(result.Content))
	for _, content := range result.Content {
		text, ok := content.(*mcp.TextContent)
		if ok {
			parts = append(parts, text.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func mergeEnv(overrides map[string]string) []string {
	base := append([]string{}, os.Environ()...)
	if len(overrides) == 0 {
		return base
	}

	for key, value := range overrides {
		base = append(base, key+"="+value)
	}
	return base
}
