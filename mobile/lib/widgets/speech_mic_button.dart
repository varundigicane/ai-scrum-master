import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// Mic button that appends recognized speech via [onText].
class SpeechMicButton extends StatefulWidget {
  const SpeechMicButton({super.key, required this.onText});

  final void Function(String text) onText;

  @override
  State<SpeechMicButton> createState() => _SpeechMicButtonState();
}

class _SpeechMicButtonState extends State<SpeechMicButton> {
  final SpeechToText _speech = SpeechToText();
  bool _available = false;
  bool _listening = false;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      _available = await _speech.initialize(
        onError: (e) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Mic: ${e.errorMsg}')),
          );
          setState(() => _listening = false);
        },
        onStatus: (s) {
          if (s == 'done' || s == 'notListening') {
            if (mounted) setState(() => _listening = false);
          }
        },
      );
    } catch (_) {
      _available = false;
    }
    if (mounted) setState(() => _ready = true);
  }

  Future<void> _toggle() async {
    if (!_available) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Speech recognition is not available on this device.')),
      );
      return;
    }
    if (_listening) {
      await _speech.stop();
      setState(() => _listening = false);
      return;
    }
    setState(() => _listening = true);
    await _speech.listen(
      onResult: (result) {
        final t = result.recognizedWords.trim();
        if (t.isNotEmpty && result.finalResult) {
          widget.onText(t);
        }
      },
      listenOptions: SpeechListenOptions(
        listenFor: const Duration(seconds: 60),
        pauseFor: const Duration(seconds: 3),
        partialResults: false,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const SizedBox(width: 40, height: 40);
    }
    return IconButton(
      tooltip: _listening ? 'Stop listening' : 'Dictate notes',
      onPressed: _toggle,
      icon: Icon(_listening ? Icons.mic : Icons.mic_none, color: _listening ? Colors.red : null),
    );
  }
}
