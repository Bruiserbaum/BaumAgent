"""SMB upload helper for saving research output to a network share."""
import os


def upload_to_smb(local_path: str, smb_cfg: dict) -> str:
    """
    Copy local_path to the configured SMB share.
    Returns the remote UNC path on success, raises on error.

    smb_cfg keys: host, share, username, password, domain, remote_path
    """
    import smbclient

    host = smb_cfg.get("host", "").strip()
    share = smb_cfg.get("share", "").strip()
    username = smb_cfg.get("username", "").strip() or None
    password = smb_cfg.get("password", "").strip() or None
    domain = smb_cfg.get("domain", "").strip() or None
    remote_path = smb_cfg.get("remote_path", "").strip().strip("/\\")

    if not host or not share:
        raise ValueError("SMB host and share are required")

    smbclient.register_session(
        host,
        username=username,
        password=password,
        domain=domain or "",
        port=445,
    )

    filename = os.path.basename(local_path)
    if remote_path:
        unc = f"\\\\{host}\\{share}\\{remote_path}\\{filename}"
    else:
        unc = f"\\\\{host}\\{share}\\{filename}"

    with open(local_path, "rb") as local_f:
        with smbclient.open_file(unc, mode="wb") as remote_f:
            remote_f.write(local_f.read())

    return unc


def test_smb_connection(smb_cfg: dict) -> str:
    """
    Try to list the root of the share.
    Returns a human-readable status string, raises on failure.
    """
    import smbclient

    host = smb_cfg.get("host", "").strip()
    share = smb_cfg.get("share", "").strip()
    username = smb_cfg.get("username", "").strip() or None
    password = smb_cfg.get("password", "").strip() or None
    domain = smb_cfg.get("domain", "").strip() or None

    if not host or not share:
        raise ValueError("SMB host and share are required")

    smbclient.register_session(
        host,
        username=username,
        password=password,
        domain=domain or "",
        port=445,
    )

    unc = f"\\\\{host}\\{share}"
    entries = list(smbclient.scandir(unc))
    return f"Connected to \\\\{host}\\{share} — {len(entries)} item(s) found"
