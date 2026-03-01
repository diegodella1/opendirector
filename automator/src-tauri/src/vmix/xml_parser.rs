/// Lightweight parser for vMix XML API responses.
/// Uses string matching — no XML crate dependency.

/// Represents a single vMix input.
#[derive(Debug, Clone, serde::Serialize)]
pub struct VmixInput {
    pub key: String,
    pub input_type: String, // "GT", "Video", "Colour", etc.
    pub title: String,
    pub fields: Vec<String>, // For GT type: field names (e.g. "Headline.Text")
}

/// Parsed vMix state from the XML API.
#[derive(Debug, Clone, serde::Serialize)]
pub struct VmixState {
    pub inputs: Vec<VmixInput>,
    pub overlays: Vec<u32>,
}

/// Parse vMix XML API response into a VmixState.
pub fn parse_vmix_xml(xml: &str) -> Result<VmixState, String> {
    let inputs = parse_inputs(xml);
    let overlays = parse_overlays(xml);
    Ok(VmixState { inputs, overlays })
}

fn parse_inputs(xml: &str) -> Vec<VmixInput> {
    let mut inputs = Vec::new();
    let inputs_start = match xml.find("<inputs>") {
        Some(pos) => pos,
        None => return inputs,
    };
    let inputs_end = match xml[inputs_start..].find("</inputs>") {
        Some(pos) => inputs_start + pos + "</inputs>".len(),
        None => return inputs,
    };
    let inputs_section = &xml[inputs_start..inputs_end];

    let mut search_pos = 0;
    while let Some(tag_start) = inputs_section[search_pos..].find("<input ") {
        let abs_start = search_pos + tag_start;
        let after_tag = &inputs_section[abs_start..];
        let (tag_end_pos, self_closing) = find_tag_end(after_tag);
        let opening_tag = &after_tag[..tag_end_pos];

        let key = extract_attr(opening_tag, "key").unwrap_or_default();
        let input_type = extract_attr(opening_tag, "type").unwrap_or_default();
        let title = extract_attr(opening_tag, "title").unwrap_or_default();

        let mut fields = Vec::new();
        if !self_closing {
            let content_start = abs_start + tag_end_pos;
            if let Some(close_pos) = inputs_section[content_start..].find("</input>") {
                let content = &inputs_section[content_start..content_start + close_pos];
                fields = extract_text_fields(content);
            }
            if let Some(close_pos) = inputs_section[abs_start..].find("</input>") {
                search_pos = abs_start + close_pos + "</input>".len();
            } else {
                search_pos = abs_start + tag_end_pos;
            }
        } else {
            search_pos = abs_start + tag_end_pos;
        }

        if !key.is_empty() {
            inputs.push(VmixInput { key, input_type, title, fields });
        }
    }
    inputs
}

fn find_tag_end(tag: &str) -> (usize, bool) {
    let bytes = tag.as_bytes();
    let len = bytes.len();
    let mut i = 0;
    while i < len {
        if bytes[i] == b'/' && i + 1 < len && bytes[i + 1] == b'>' {
            return (i + 2, true);
        }
        if bytes[i] == b'>' {
            return (i + 1, false);
        }
        i += 1;
    }
    (len, true)
}

fn extract_attr(tag: &str, attr_name: &str) -> Option<String> {
    let pattern_dq = format!("{}=\"", attr_name);
    if let Some(start) = tag.find(&pattern_dq) {
        let value_start = start + pattern_dq.len();
        if let Some(end) = tag[value_start..].find('"') {
            return Some(unescape_xml(&tag[value_start..value_start + end]));
        }
    }
    let pattern_sq = format!("{}='", attr_name);
    if let Some(start) = tag.find(&pattern_sq) {
        let value_start = start + pattern_sq.len();
        if let Some(end) = tag[value_start..].find('\'') {
            return Some(unescape_xml(&tag[value_start..value_start + end]));
        }
    }
    None
}

fn extract_text_fields(content: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut pos = 0;
    while let Some(tag_start) = content[pos..].find("<text ") {
        let abs = pos + tag_start;
        let after = &content[abs..];
        let (tag_end, _) = find_tag_end(after);
        let tag_str = &after[..tag_end];
        if let Some(name) = extract_attr(tag_str, "name") {
            if !name.is_empty() {
                fields.push(name);
            }
        }
        pos = abs + tag_end;
    }
    fields
}

fn unescape_xml(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn parse_overlays(xml: &str) -> Vec<u32> {
    let mut overlays = Vec::new();
    let overlays_start = match xml.find("<overlays>") {
        Some(pos) => pos,
        None => return overlays,
    };
    let overlays_end = match xml[overlays_start..].find("</overlays>") {
        Some(pos) => overlays_start + pos,
        None => return overlays,
    };
    let section = &xml[overlays_start..overlays_end];
    let mut pos = 0;
    while let Some(tag_start) = section[pos..].find("<overlay ") {
        let abs = pos + tag_start;
        let after = &section[abs..];
        let (tag_end, _) = find_tag_end(after);
        let tag_str = &after[..tag_end];
        if let Some(num_str) = extract_attr(tag_str, "number") {
            if let Ok(num) = num_str.parse::<u32>() {
                overlays.push(num);
            }
        }
        pos = abs + tag_end;
    }
    overlays
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_xml() {
        let xml = r#"<vmix>
<inputs>
<input key="abc123" type="GT" title="Lower Third">
<text name="Headline.Text">Hello</text>
<text name="Description.Text">World</text>
</input>
<input key="def456" type="Video" title="CLIP_A" />
</inputs>
<overlays>
<overlay number="1" />
<overlay number="2" />
</overlays>
</vmix>"#;

        let state = parse_vmix_xml(xml).unwrap();
        assert_eq!(state.inputs.len(), 2);
        assert_eq!(state.inputs[0].key, "abc123");
        assert_eq!(state.inputs[0].input_type, "GT");
        assert_eq!(state.inputs[0].fields, vec!["Headline.Text", "Description.Text"]);
        assert_eq!(state.inputs[1].key, "def456");
        assert_eq!(state.inputs[1].input_type, "Video");
        assert!(state.inputs[1].fields.is_empty());
        assert_eq!(state.overlays, vec![1, 2]);
    }

    #[test]
    fn test_parse_empty_xml() {
        let xml = "<vmix><inputs></inputs><overlays></overlays></vmix>";
        let state = parse_vmix_xml(xml).unwrap();
        assert!(state.inputs.is_empty());
        assert!(state.overlays.is_empty());
    }
}
