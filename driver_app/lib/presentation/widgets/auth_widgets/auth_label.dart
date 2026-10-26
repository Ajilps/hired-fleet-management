
import 'package:driver_app/core/theme/app_text_style.dart';
import 'package:flutter/material.dart';

class AuthLabel extends StatelessWidget {
  const new({super.key, required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: AlignmentGeometry.centerStart,
      child: Text(label, style: AppTextStyles.fieldLabel),
    );
  }
}