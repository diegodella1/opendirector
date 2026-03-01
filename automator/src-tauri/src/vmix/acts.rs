/// ACTS (Activator) update from vMix — reports clip playback position.
///
/// Format: `ACTS <inputKey> <positionMs> <durationMs>`
/// When no clip is playing: `ACTS 0 0 0`
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActsUpdate {
    pub input_key: String,
    pub position_ms: u64,
    pub duration_ms: u64,
}

/// Parse an ACTS line from vMix TCP.
///
/// Expected format after trimming: `ACTS <inputKey> <positionMs> <durationMs>`
/// Returns `None` if the line doesn't match or can't be parsed.
pub fn parse_acts_line(line: &str) -> Option<ActsUpdate> {
    let trimmed = line.trim();

    // Accept both initial "ACTS OK" subscription confirmation (ignore it)
    // and actual ACTS data lines
    if trimmed == "ACTS OK" {
        return None;
    }

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() != 4 || parts[0] != "ACTS" {
        return None;
    }

    let input_key = parts[1].to_string();
    let position_ms: u64 = parts[2].parse().ok()?;
    let duration_ms: u64 = parts[3].parse().ok()?;

    Some(ActsUpdate {
        input_key,
        position_ms,
        duration_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_acts_line_normal() {
        let update = parse_acts_line("ACTS abc123 45000 120000").unwrap();
        assert_eq!(update.input_key, "abc123");
        assert_eq!(update.position_ms, 45000);
        assert_eq!(update.duration_ms, 120000);
    }

    #[test]
    fn test_parse_acts_line_zero() {
        let update = parse_acts_line("ACTS 0 0 0").unwrap();
        assert_eq!(update.input_key, "0");
        assert_eq!(update.position_ms, 0);
        assert_eq!(update.duration_ms, 0);
    }

    #[test]
    fn test_parse_acts_ok_returns_none() {
        assert!(parse_acts_line("ACTS OK").is_none());
    }

    #[test]
    fn test_parse_acts_wrong_prefix() {
        assert!(parse_acts_line("TALLY OK 012010").is_none());
    }

    #[test]
    fn test_parse_acts_invalid_numbers() {
        assert!(parse_acts_line("ACTS key notanumber 120000").is_none());
    }

    #[test]
    fn test_parse_acts_too_few_parts() {
        assert!(parse_acts_line("ACTS key 1000").is_none());
    }

    #[test]
    fn test_parse_acts_with_whitespace() {
        let update = parse_acts_line("  ACTS myinput 5000 60000  ").unwrap();
        assert_eq!(update.input_key, "myinput");
        assert_eq!(update.position_ms, 5000);
        assert_eq!(update.duration_ms, 60000);
    }
}
