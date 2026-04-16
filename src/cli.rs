use std::io::IsTerminal;

pub struct Style {
    pub bold: &'static str,
    pub dim: &'static str,
    pub green: &'static str,
    pub red: &'static str,
    pub yellow: &'static str,
    pub cyan: &'static str,
    pub reset: &'static str,
}

const COLOR: Style = Style {
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    reset: "\x1b[0m",
};

const PLAIN: Style = Style {
    bold: "",
    dim: "",
    green: "",
    red: "",
    yellow: "",
    cyan: "",
    reset: "",
};

pub fn style() -> &'static Style {
    if std::io::stderr().is_terminal() {
        &COLOR
    } else {
        &PLAIN
    }
}
