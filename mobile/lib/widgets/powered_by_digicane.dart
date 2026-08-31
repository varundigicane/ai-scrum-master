import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

const _digicaneUrl = 'https://www.digicanesystems.com';

class PoweredByDigicane extends StatefulWidget {
  const PoweredByDigicane({super.key, this.alignment = Alignment.center});

  final AlignmentGeometry alignment;

  @override
  State<PoweredByDigicane> createState() => _PoweredByDigicaneState();
}

class _PoweredByDigicaneState extends State<PoweredByDigicane> {
  String? _versionLabel;

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  Future<void> _loadVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() {
        _versionLabel = 'v${info.version} (${info.buildNumber})';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _versionLabel = null);
    }
  }

  Future<void> _open() async {
    final uri = Uri.parse(_digicaneUrl);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: widget.alignment,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextButton(
            onPressed: _open,
            style: TextButton.styleFrom(
              foregroundColor: Colors.blueGrey.shade600,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text(
              'Powered By Digicane Systems',
              style: TextStyle(fontSize: 12, decoration: TextDecoration.underline),
            ),
          ),
          if (_versionLabel != null)
            Text(
              _versionLabel!,
              style: TextStyle(fontSize: 11, color: Colors.blueGrey.shade500),
            ),
        ],
      ),
    );
  }
}
