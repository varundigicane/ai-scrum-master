import 'package:flutter/material.dart';

/// Digicane Overview palette — matches web `OVERVIEW_COLORS`.
class OverviewPalette {
  static const accent = Color(0xFF0D9488);
  static const accent2 = Color(0xFF0284C7);
  static const ok = Color(0xFF059669);
  static const warn = Color(0xFFD97706);
  static const danger = Color(0xFFE11D48);
  static const muted = Color(0xFF5B738C);

  static const rag = {
    'Red': danger,
    'Amber': warn,
    'Green': ok,
  };

  static const severity = {
    'low': ok,
    'medium': warn,
    'high': Color(0xFFEA580C),
    'critical': danger,
  };

  static const phase = {
    'Requirements': accent2,
    'Design': Color(0xFF0EA5E9),
    'Dev': accent,
    'Test': ok,
    'UAT': warn,
    'Closed': muted,
  };

  static const taskStatus = {
    'todo': accent2,
    'in_progress': accent,
    'blocked': danger,
    'done': ok,
  };

  static const statusState = {
    'submitted': ok,
    'pending': warn,
    'expired': danger,
    'skipped_leave': muted,
  };

  static Color kpiTone(String label, num value) {
    switch (label) {
      case 'Overdue tasks':
      case 'Open defects':
      case 'Overdue reminders':
        return value > 0 ? danger : muted;
      case 'Pending status':
      case 'Due soon':
        return value > 0 ? warn : muted;
      case 'Resources':
        return accent2;
      default:
        return accent;
    }
  }
}
