package main

import (
	"encoding/json"
	"os"
	"strings"
)

type HookInput struct {
	Hook   string `json:"hook"`
	Config struct {
		Threshold float64 `json:"threshold"`
	} `json:"config"`
	Email struct {
		From     string            `json:"from"`
		To       []string          `json:"to"`
		Subject  string            `json:"subject"`
		Headers  map[string]string `json:"headers"`
		BodyText string            `json:"body_text"`
	} `json:"email"`
}

type HookOutput struct {
	Action    string   `json:"action"` // "accept", "spam", "reject"
	SpamScore float64  `json:"spam_score"`
	Tags      []string `json:"tags"`
}

func main() {
	var input HookInput
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		// Output default accept on parse failure so email delivery is never blocked
		_ = json.NewEncoder(os.Stdout).Encode(HookOutput{Action: "accept", SpamScore: 0.0})
		return
	}

	threshold := input.Config.Threshold
	if threshold <= 0 {
		threshold = 0.75
	}

	score := 0.0
	tags := []string{}

	// 1. Check Authentication-Results header
	authHeader := input.Email.Headers["Authentication-Results"]
	if strings.Contains(authHeader, "dkim=pass") {
		tags = append(tags, "dkim-pass")
		score -= 0.1
	} else if strings.Contains(authHeader, "dkim=fail") {
		score += 0.4
		tags = append(tags, "dkim-fail")
	}

	// 2. Keyword heuristics
	content := strings.ToLower(input.Email.Subject + " " + input.Email.BodyText)
	spamKeywords := []string{
		"viagra", "cryptocurrency investment", "wire transfer immediately",
		"claim your prize", "nigerian prince", "lottery winner",
	}

	for _, kw := range spamKeywords {
		if strings.Contains(content, kw) {
			score += 0.45
			tags = append(tags, "spam-keyword")
		}
	}

	// Clamp score between 0.0 and 1.0
	if score < 0.0 {
		score = 0.0
	} else if score > 1.0 {
		score = 1.0
	}

	action := "accept"
	if score >= threshold {
		action = "spam"
	}

	out := HookOutput{
		Action:    action,
		SpamScore: score,
		Tags:      tags,
	}

	_ = json.NewEncoder(os.Stdout).Encode(out)
}
