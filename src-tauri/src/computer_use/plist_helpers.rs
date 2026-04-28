pub(super) fn plist_string(contents: &str, key: &str) -> Option<String> {
    let key_marker = format!("<key>{key}</key>");
    let key_start = contents.find(&key_marker)?;
    let after_key = &contents[key_start + key_marker.len()..];
    first_xml_string(after_key)
}

pub(super) fn plist_array_strings(contents: &str, key: &str) -> Vec<String> {
    let key_marker = format!("<key>{key}</key>");
    let Some(key_start) = contents.find(&key_marker) else {
        return Vec::new();
    };
    let after_key = &contents[key_start + key_marker.len()..];
    let Some(array_start) = after_key.find("<array>") else {
        return Vec::new();
    };
    let after_array = &after_key[array_start + "<array>".len()..];
    let Some(array_end) = after_array.find("</array>") else {
        return Vec::new();
    };

    xml_strings(&after_array[..array_end])
}

fn first_xml_string(contents: &str) -> Option<String> {
    xml_strings(contents).into_iter().next()
}

fn xml_strings(contents: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut remaining = contents;

    while let Some(start) = remaining.find("<string>") {
        let value_start = start + "<string>".len();
        let after_start = &remaining[value_start..];
        let Some(end) = after_start.find("</string>") else {
            break;
        };
        values.push(unescape_minimal_xml(&after_start[..end]));
        remaining = &after_start[end + "</string>".len()..];
    }

    values
}

fn unescape_minimal_xml(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}
