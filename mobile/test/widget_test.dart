import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_scrum_master/theme.dart';

void main() {
  test('Digicane light theme builds', () {
    final theme = digicaneLightTheme;
    expect(theme.brightness, equals(Brightness.light));
  });
}
