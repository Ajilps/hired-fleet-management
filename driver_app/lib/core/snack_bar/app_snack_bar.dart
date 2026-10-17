import 'package:driver_app/core/enum/snack_bar.dart';
import 'package:driver_app/core/utils/sanack_bar.dart';
import 'package:flutter/material.dart';

class AppSnackBar {
  static void show(
    BuildContext context, {
    required String message,
    String? actionLabel,
    VoidCallback? onAction,
    SnackType type = SnackType.info,
    Duration duration = const Duration(seconds: 4),
  }) {
    final (bg, fg) = SanackBarUtils.getSnackColors(type);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            message,
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: fg,
            ),
          ),
          backgroundColor: bg,
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(16),
          duration: duration,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          action: (actionLabel != null)
              ? SnackBarAction(
                  label: actionLabel,
                  textColor: fg,
                  onPressed: onAction ?? () {},
                )
              : null,
        ),
      );
  }

  static void error(
    BuildContext context,
    String message, {
    String? actionLabel,
    VoidCallback? onAction,
  }) => show(
    context,
    message: message,
    actionLabel: actionLabel,
    onAction: onAction,
    type: SnackType.error,
  );

  static void success(BuildContext context, String message) =>
      show(context, message: message, type: SnackType.success);
}
