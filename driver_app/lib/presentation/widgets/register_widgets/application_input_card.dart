
import 'package:driver_app/core/theme/app_colors.dart';
import 'package:driver_app/core/theme/app_radius.dart';
import 'package:driver_app/core/theme/app_text_style.dart';
import 'package:flutter/material.dart';

class ApplicationInputCard extends StatelessWidget {
  const ApplicationInputCard({
    super.key,
    required this.label,
    required this.icon,
    this.subtitle = 'Upload required',
    this.onTap,
  });

  final String label;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadius.control),
        color: AppColors.primaryDark.withValues(alpha: 0.05),
      ),
      child: Row(
        children: [
          SizedBox(width: 50, child: Icon(icon, color: AppColors.primaryDark)),
          const SizedBox(width: 10),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                  style: AppTextStyles.fieldLabel,
                ),
                Text(subtitle),
              ],
            ),
          ),

          SizedBox(width: 10),

          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadius.chip),
            child: Container(
              padding: const EdgeInsets.all(15),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppRadius.chip),
                border: Border.all(
                  color: AppColors.textPrimary.withValues(alpha: 0.3),
                  width: 1,
                ),
              ),
              child: const Icon(Icons.arrow_forward_ios, size: 15),
            ),
          ),
        ],
      ),
    );
  }
}
