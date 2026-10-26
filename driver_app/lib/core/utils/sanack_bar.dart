

import 'package:driver_app/core/enum/snack_bar.dart';
import 'package:driver_app/core/theme/app_colors.dart';
import 'package:flutter/material.dart';

class SanackBarUtils {
  static (Color, Color) getSnackColors(SnackType type) {
  final (bg, fg) = switch (type) {
    SnackType.success => (AppColors.successFg, Colors.white),
    SnackType.error => (AppColors.errorFg, Colors.white),
    SnackType.info => (AppColors.textPrimary, Colors.white),
  };

  return (bg, fg);
}
}