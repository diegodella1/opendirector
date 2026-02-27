/// Tally state for a single input.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TallyState {
    /// 1-indexed input number that is on Program, or 0 if none.
    pub program: u32,
    /// 1-indexed input number that is on Preview, or 0 if none.
    pub preview: u32,
    /// Raw tally string from vMix (e.g., "012010...").
    pub raw: String,
}

/// Parse vMix tally string.
///
/// Format: each character position (0-indexed) corresponds to an input (1-indexed).
/// - '0' = off
/// - '1' = program
/// - '2' = preview
///
/// We find the first input on program and preview.
pub fn parse_tally(tally_str: &str) -> TallyState {
    let mut program: u32 = 0;
    let mut preview: u32 = 0;

    for (i, ch) in tally_str.chars().enumerate() {
        let input_num = (i + 1) as u32;
        match ch {
            '1' => {
                if program == 0 {
                    program = input_num;
                }
            }
            '2' => {
                if preview == 0 {
                    preview = input_num;
                }
            }
            _ => {}
        }
    }

    TallyState {
        program,
        preview,
        raw: tally_str.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tally() {
        let t = parse_tally("012010");
        assert_eq!(t.program, 2);
        assert_eq!(t.preview, 3);
    }

    #[test]
    fn test_parse_tally_no_program() {
        let t = parse_tally("002000");
        assert_eq!(t.program, 0);
        assert_eq!(t.preview, 1);
    }

    #[test]
    fn test_parse_tally_empty() {
        let t = parse_tally("");
        assert_eq!(t.program, 0);
        assert_eq!(t.preview, 0);
    }
}
