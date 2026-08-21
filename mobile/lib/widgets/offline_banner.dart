import 'package:flutter/material.dart';

import '../repository.dart';

/// Thin strip shown under the app bar when offline or when writes are queued.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final sync = repo.sync;
    return AnimatedBuilder(
      animation: sync,
      builder: (context, _) {
        final offline = !sync.online;
        final pending = sync.pending;
        if (!offline && pending == 0) return const SizedBox.shrink();
        final color = offline ? Colors.orange.shade700 : Colors.blueGrey.shade600;
        final text = offline
            ? (pending > 0
                ? 'Offline — $pending change${pending == 1 ? '' : 's'} will sync when back online'
                : 'Offline — showing saved data')
            : 'Syncing $pending change${pending == 1 ? '' : 's'}…';
        return Material(
          color: color,
          child: SafeArea(
            top: false,
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Row(
                children: [
                  Icon(offline ? Icons.cloud_off : Icons.sync, size: 16, color: Colors.white),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      text,
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                    ),
                  ),
                  if (!offline && pending > 0)
                    const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
