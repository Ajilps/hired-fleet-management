
import 'dart:ui';

import 'package:driver_app/core/theme/app_colors.dart';

class StatusColors {
  const StatusColors(this.bg, this.fg);
  final Color bg;
  final Color fg;

  static const available = StatusColors(AppColors.successBg, AppColors.successFg);
  static const assigned = StatusColors(AppColors.primaryTint, AppColors.primaryDark);
  static const pending = StatusColors(AppColors.warningBg, AppColors.warningFg);
  static const cancelled = StatusColors(AppColors.errorBg, AppColors.errorFg);
}