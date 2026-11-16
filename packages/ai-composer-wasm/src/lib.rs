use std::slice;
use std::str;

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    if !ptr.is_null() && size > 0 {
        unsafe {
            let _ = Vec::from_raw_parts(ptr, 0, size);
        }
    }
}

#[no_mangle]
pub extern "C" fn generate_draft(
    prompt_ptr: *const u8,
    prompt_len: usize,
    tone_code: u32,
    length_code: u32,
    out_len_ptr: *mut usize,
) -> *mut u8 {
    let prompt = if prompt_ptr.is_null() || prompt_len == 0 {
        ""
    } else {
        let slice = unsafe { slice::from_raw_parts(prompt_ptr, prompt_len) };
        str::from_utf8(slice).unwrap_or("")
    };

    let result = synthesize_email(prompt, tone_code, length_code);
    let bytes = result.into_bytes();
    let len = bytes.len();
    let ptr = bytes.as_ptr() as *mut u8;
    std::mem::forget(bytes);

    if !out_len_ptr.is_null() {
        unsafe {
            *out_len_ptr = len;
        }
    }

    ptr
}

fn synthesize_email(prompt: &str, tone_code: u32, length_code: u32) -> String {
    let p_lower = prompt.to_lowercase();
    let trimmed = prompt.trim();

    // 1. Determine Addressee
    let addressee = extract_addressee(&p_lower);

    // 2. Determine Intent
    let intent = detect_intent(&p_lower);

    // 3. Greeting based on tone & addressee
    let greeting = match (tone_code, &addressee) {
        (4, Some(name)) => format!("Dear {},", capitalize(name)), // Formal
        (4, None) => "Dear Team,".to_string(),
        (1, Some(name)) | (5, Some(name)) => format!("Hi {}!", capitalize(name)), // Friendly / Casual
        (1, None) | (5, None) => "Hi everyone,".to_string(),
        (_, Some(name)) => format!("Hi {},", capitalize(name)), // Professional / Concise / Urgent
        (_, None) => "Hello,".to_string(),
    };

    // 4. Extract specific times/dates or topics mentioned
    let time_mention = extract_time_mention(trimmed);

    // 5. Build body paragraphs
    let mut body = String::new();
    body.push_str(&greeting);
    body.push_str("\n\n");

    match (intent, tone_code, length_code) {
        // Concise Mode (length_code == 1 or tone_code == 2)
        (_, _, 1) | (_, 2, _) => {
            let msg = generate_concise(&p_lower, trimmed, intent, time_mention.as_deref());
            body.push_str(&msg);
            body.push_str("\n\n");
        }
        // Detailed Mode (length_code == 2)
        (_, _, 2) => {
            let msg = generate_detailed(&p_lower, trimmed, intent, tone_code, time_mention.as_deref());
            body.push_str(&msg);
            body.push_str("\n\n");
        }
        // Standard Mode (default)
        _ => {
            let msg = generate_standard(&p_lower, trimmed, intent, tone_code, time_mention.as_deref());
            body.push_str(&msg);
            body.push_str("\n\n");
        }
    }

    // 6. Signoff based on tone
    let signoff = match tone_code {
        1 => "Warmly,",            // Friendly
        2 => "Thanks,",            // Concise
        3 => "Regards,",           // Urgent
        4 => "Sincerely,",         // Formal
        5 => "Cheers,",            // Casual
        _ => "Best regards,",      // Professional
    };

    body.push_str(signoff);
    body
}

#[derive(Clone, Copy)]
enum EmailIntent {
    Meeting,
    FollowUp,
    Decline,
    ThankYou,
    StatusUpdate,
    Apology,
    Proposal,
    Inquiry,
    General,
}

fn detect_intent(prompt: &str) -> EmailIntent {
    if prompt.contains("meet") || prompt.contains("schedule") || prompt.contains("call") || prompt.contains("sync") {
        EmailIntent::Meeting
    } else if prompt.contains("follow up") || prompt.contains("following up") || prompt.contains("check in") || prompt.contains("touch base") {
        EmailIntent::FollowUp
    } else if prompt.contains("decline") || prompt.contains("reject") || prompt.contains("pass on") || prompt.contains("cannot make") || prompt.contains("unable to") {
        EmailIntent::Decline
    } else if prompt.contains("thank") || prompt.contains("appreciat") || prompt.contains("grateful") {
        EmailIntent::ThankYou
    } else if prompt.contains("status") || prompt.contains("update") || prompt.contains("progress") || prompt.contains("milestone") {
        EmailIntent::StatusUpdate
    } else if prompt.contains("apolog") || prompt.contains("sorry") || prompt.contains("delay") || prompt.contains("oversight") {
        EmailIntent::Apology
    } else if prompt.contains("propos") || prompt.contains("pitch") || prompt.contains("quote") || prompt.contains("contract") {
        EmailIntent::Proposal
    } else if prompt.contains("ask") || prompt.contains("question") || prompt.contains("inqu") || prompt.contains("wondering") {
        EmailIntent::Inquiry
    } else {
        EmailIntent::General
    }
}

fn extract_addressee(prompt: &str) -> Option<String> {
    for prefix in &["to ", "email ", "write to ", "for "] {
        if let Some(pos) = prompt.find(prefix) {
            let rest = &prompt[pos + prefix.len()..];
            let first_word = rest.split_whitespace().next()?;
            let clean = first_word.trim_matches(|c: char| !c.is_alphabetic());
            if !clean.is_empty() && !["the", "a", "an", "my", "our", "him", "her", "them", "someone"].contains(&clean) {
                return Some(clean.to_string());
            }
        }
    }
    None
}

fn extract_time_mention(prompt: &str) -> Option<String> {
    let lower = prompt.to_lowercase();
    let keywords = [
        "today", "tomorrow", "this afternoon", "next week", "monday", "tuesday",
        "wednesday", "thursday", "friday", "saturday", "sunday", "2 pm", "3 pm",
        "10 am", "11 am", "morning", "afternoon", "end of day", "eod"
    ];
    for kw in keywords {
        if lower.contains(kw) {
            return Some(kw.to_string());
        }
    }
    None
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

fn clean_prompt_core(prompt: &str) -> String {
    let mut s = prompt.trim();
    for prefix in &[
        "write an email to ", "write an email about ", "write an email ",
        "draft an email to ", "draft an email ", "compose an email ",
        "write to ", "tell them that ", "tell him that ", "tell her that ",
        "saying that ", "about "
    ] {
        if s.to_lowercase().starts_with(prefix) {
            s = &s[prefix.len()..];
        }
    }
    s.trim().to_string()
}

fn generate_concise(_p_lower: &str, raw: &str, intent: EmailIntent, time: Option<&str>) -> String {
    let core = clean_prompt_core(raw);
    match intent {
        EmailIntent::Meeting => {
            if let Some(t) = time {
                format!("Are you available to sync on {}? Let me know if that time works for you.", t)
            } else {
                format!("Could we schedule a quick call to discuss {}? Please let me know your availability.", core)
            }
        }
        EmailIntent::FollowUp => {
            format!("Following up on our recent conversation regarding {}. Please let me know if you have any updates.", core)
        }
        EmailIntent::Decline => {
            "Thank you for the opportunity. Unfortunately, I will have to pass at this time. I appreciate your understanding.".to_string()
        }
        EmailIntent::ThankYou => {
            format!("Thank you for your assistance with {}. It was greatly appreciated!", core)
        }
        EmailIntent::StatusUpdate => {
            format!("Quick update on {}: everything is progressing on schedule. I will share more details soon.", core)
        }
        EmailIntent::Apology => {
            format!("I apologize for the delay regarding {}. I will have this resolved as soon as possible.", core)
        }
        _ => {
            format!("I am reaching out regarding {}. Please let me know your thoughts.", core)
        }
    }
}

fn generate_standard(_p_lower: &str, raw: &str, intent: EmailIntent, tone_code: u32, time: Option<&str>) -> String {
    let core = clean_prompt_core(raw);
    let is_friendly = tone_code == 1 || tone_code == 5;
    let is_urgent = tone_code == 3;

    match intent {
        EmailIntent::Meeting => {
            let when = time.unwrap_or("later this week");
            if is_friendly {
                format!(
                    "I hope you're having a wonderful week!\n\nI'd love to connect and catch up on {}. Would you be free for a brief sync around {}? Looking forward to our chat.",
                    core, when
                )
            } else {
                format!(
                    "I hope this email finds you well.\n\nI am writing to schedule some time to discuss {}. Would you have 20 minutes available on {}? If another time works better for your calendar, please feel free to send over a few alternatives.",
                    core, when
                )
            }
        }
        EmailIntent::FollowUp => {
            if is_urgent {
                format!(
                    "I am writing to urgently follow up on {}. We need to finalize the next steps as soon as possible.\n\nPlease review and let me know your feedback at your earliest convenience.",
                    core
                )
            } else if is_friendly {
                format!(
                    "Hope all is well on your end!\n\nJust wanted to touch base regarding {}. Whenever you get a chance, let me know how things are shaping up.",
                    core
                )
            } else {
                format!(
                    "I hope you are doing well.\n\nI am following up on our previous discussion concerning {}. Please let me know if there are any updates or if you require any additional information from my side.",
                    core
                )
            }
        }
        EmailIntent::Decline => {
            format!(
                "Thank you very much for reaching out and sharing the details regarding {}.\n\nAfter careful review, I regret to inform you that we are unable to move forward at this time. We truly appreciate your time and consideration, and hope to have the opportunity to collaborate in the future.",
                core
            )
        }
        EmailIntent::ThankYou => {
            format!(
                "I wanted to take a moment to express my sincere appreciation for {}.\n\nYour support and insight have been invaluable. Thank you once again for your dedication and partnership.",
                core
            )
        }
        EmailIntent::StatusUpdate => {
            format!(
                "I am writing to provide a status update on {}.\n\nKey progress has been made according to schedule, and all deliverables remain on track. Please let me know if you would like to review the milestone details together.",
                core
            )
        }
        EmailIntent::Apology => {
            format!(
                "I am writing to sincerely apologize for the delay regarding {}.\n\nWe encountered an unforeseen bottleneck, but I am personally seeing this through to completion. Thank you for your patience and understanding while we resolve this.",
                core
            )
        }
        EmailIntent::Proposal => {
            format!(
                "I am pleased to present our proposal regarding {}.\n\nWe have tailored this to align directly with your objectives and timelines. Please take a look at the outline, and I would be delighted to answer any questions or walk through the specifics with you.",
                core
            )
        }
        _ => {
            format!(
                "I hope this email finds you well.\n\nI am reaching out regarding {}. I wanted to share this with you and gather your thoughts on how best to proceed.\n\nPlease let me know your availability if you would like to discuss this further.",
                core
            )
        }
    }
}

fn generate_detailed(_p_lower: &str, raw: &str, _intent: EmailIntent, _tone_code: u32, time: Option<&str>) -> String {
    let core = clean_prompt_core(raw);
    let time_str = time.unwrap_or("in the coming days");

    format!(
        "I hope you are having a productive week.\n\nI am writing to provide comprehensive details regarding {}.\n\nHere is a quick summary of the key points:\n• Current Status: Under active review and aligned with our target schedule.\n• Key Objective: Ensure all stakeholders have clarity on deliverables and expectations around {}.\n• Next Steps: Review the proposal points and finalize our action items.\n\nPlease let me know if you have any questions or if you'd like to adjust any of the parameters above. I look forward to working together on this.",
        core, time_str
    )
}
