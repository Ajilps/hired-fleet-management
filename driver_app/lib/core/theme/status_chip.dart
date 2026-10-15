import 'package:driver_app/core/theme/app_radius.dart';
import 'package:driver_app/core/theme/app_status_colors.dart';
import 'package:flutter/material.dart';

class StatusChip extends StatelessWidget {
  const StatusChip(this.label, this.colors, {super.key});
  final String label;
  final StatusColors colors;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: BorderRadius.circular(AppRadius.chip),
      ),
      child: Text(
        label,
        style: TextStyle(
            color: colors.fg, fontSize: 14, fontWeight: FontWeight.w600),
      ),
    );
  }
}