//! 端口占用解析：`netstat -ano` 输出 → 结构化 PortEntry。
//! 纯函数解析，跨 Windows / POSIX 两种 netstat 方言做容错。

use serde::Serialize;

#[derive(Serialize, Clone, Debug, ts_rs::TS)]
pub struct PortEntry {
    pub protocol: String,
    pub local_addr: String,
    pub local_port: u16,
    pub remote_addr: String,
    pub state: String,
    pub pid: u32,
}

/// 从 netstat 输出中解析端口条目。
/// Windows 行：`TCP    0.0.0.0:5173    0.0.0.0:0    LISTENING    12345`
/// POSIX 行：   `tcp        0      0 0.0.0.0:5173  0.0.0.0:*    LISTENING      21456/node`
pub fn parse_netstat(output: &str) -> Vec<PortEntry> {
    let mut out = Vec::new();
    for line in output.lines() {
        let tokens: Vec<&str> = line.split_whitespace().collect();
        let proto_raw = match tokens.first() {
            Some(t) => *t,
            None => continue,
        };
        let protocol = match proto_raw.to_ascii_uppercase().as_str() {
            "TCP" | "TCP6" => "TCP",
            "UDP" | "UDP6" => "UDP",
            _ => continue,
        };
        // POSIX 方言第 2 列是 Recv-Q（纯数字），Windows 第 2 列就是本地地址。
        let posix = tokens.len() >= 4 && tokens[1].chars().all(|c| c.is_ascii_digit());
        let (local, foreign, state, pid_tok) = if posix {
            let local = tokens[3];
            let foreign = tokens.get(4).copied().unwrap_or("");
            if protocol == "TCP" {
                (local, foreign, tokens.get(5).copied(), tokens.get(6).copied())
            } else {
                (local, foreign, None, tokens.get(5).copied())
            }
        } else {
            let local = match tokens.get(1) {
                Some(t) => *t,
                None => continue,
            };
            let foreign = tokens.get(2).copied().unwrap_or("");
            if protocol == "TCP" {
                (local, foreign, tokens.get(3).copied(), tokens.get(4).copied())
            } else {
                (local, foreign, None, tokens.get(3).copied())
            }
        };
        let (local_addr, local_port) = match split_host_port(local) {
            Some(pair) => pair,
            None => continue,
        };
        let pid_tok = match pid_tok {
            Some(t) => t,
            None => continue,
        };
        // POSIX 的 PID 列形如 `21456/node`，取斜杠前段。
        let pid_str = pid_tok.split('/').next().unwrap_or(pid_tok);
        let pid = match pid_str.parse::<u32>() {
            Ok(p) => p,
            Err(_) => continue,
        };
        let (remote_addr, _) = split_host_port(foreign).unwrap_or((foreign.to_string(), 0));
        out.push(PortEntry {
            protocol: protocol.to_string(),
            local_addr,
            local_port,
            remote_addr,
            state: state
                .map(|s| s.to_ascii_uppercase())
                .unwrap_or_else(|| "UDP".to_string()),
            pid,
        });
    }
    out
}

/// 拆 `[::1]:5173` / `0.0.0.0:5173` / `:::5173` / `*:*` → (addr, port)
pub fn split_host_port(s: &str) -> Option<(String, u16)> {
    let trimmed = s.trim();
    let idx = trimmed.rfind(':')?;
    let (addr_part, port_part) = (&trimmed[..idx], &trimmed[idx + 1..]);
    if port_part == "*" {
        return Some((addr_part.trim_matches(|c| c == '[' || c == ']').to_string(), 0));
    }
    let port: u16 = port_part.parse().ok()?;
    let addr = addr_part
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_string();
    Some((addr, port))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WIN_OUTPUT: &str = "
活动连接

  协议  本地地址              外部地址        状态                     PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1240
  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       21456
  TCP    [::]:5173              [::]:0                 LISTENING       21456
  TCP    127.0.0.1:54321        127.0.0.1:5173         ESTABLISHED     21456
  UDP    0.0.0.0:5353           *:*                                    4567
";

    const POSIX_OUTPUT: &str = "
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:5173          0.0.0.0:*               LISTENING      21456/node
tcp6       0      0 :::8080                 :::*                    LISTENING      1001
udp        0      0 0.0.0.0:5353          0.0.0.0:*                           1002
";

    #[test]
    fn parses_windows_netstat() {
        let entries = parse_netstat(WIN_OUTPUT);
        assert_eq!(entries.len(), 5);
        let dev = entries
            .iter()
            .find(|e| e.local_port == 5173 && e.protocol == "TCP")
            .unwrap();
        assert_eq!(dev.state, "LISTENING");
        assert_eq!(dev.pid, 21456);
        assert_eq!(dev.local_addr, "0.0.0.0");

        let v6 = entries.iter().find(|e| e.local_addr == "::").unwrap();
        assert_eq!(v6.local_port, 5173);

        let udp = entries.iter().find(|e| e.protocol == "UDP").unwrap();
        assert_eq!(udp.pid, 4567);
        assert_eq!(udp.local_port, 5353);
    }

    #[test]
    fn parses_posix_netstat() {
        let entries = parse_netstat(POSIX_OUTPUT);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].local_port, 5173);
        assert_eq!(entries[0].pid, 21456);
        assert_eq!(entries[1].local_port, 8080);
        assert_eq!(entries[2].protocol, "UDP");
    }

    #[test]
    fn skips_garbage_and_headers() {
        assert!(parse_netstat("").is_empty());
        assert!(parse_netstat("  协议  本地地址  外部地址").is_empty());
        assert!(parse_netstat("TCP incomplete").is_empty());
        assert!(parse_netstat("FOO 1.2.3.4:80 0.0.0.0:0 LISTENING 1").is_empty());
    }
}
