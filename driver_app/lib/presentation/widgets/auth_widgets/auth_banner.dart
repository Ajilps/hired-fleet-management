import 'package:driver_app/core/theme/app_colors.dart';
import 'package:driver_app/core/theme/app_radius.dart';
import 'package:driver_app/core/theme/app_text_style.dart';
import 'package:flutter/material.dart';

class AuthBanner extends StatelessWidget {
  const new({super.key,this.firstLabel,this.secondLabel});
  final String? firstLabel;
  final String? secondLabel;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(7),
      width: double.infinity,

      decoration: BoxDecoration( boxShadow: [
      BoxShadow(
        color: AppColors.textPrimary.withValues(alpha: 0.1),
        blurRadius: 10,
        spreadRadius: 2,
        offset: const Offset(0, 4),
      ),
    ],
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(AppRadius.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 70,
            child: Image.asset('assets/logo/hired_white.png'),
          ),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
            child: Text(
             firstLabel?? 'Every Trip ',
              style: AppTextStyles.heroTagline,
              textAlign: TextAlign.start,
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(11, 0, 11, 15),
            child: Text(
              secondLabel??'A Clear Way Forward',
              style: AppTextStyles.heroTagline,
              textAlign: TextAlign.start,
            ),
          ),
        ],
      ),
    );
  }
}
