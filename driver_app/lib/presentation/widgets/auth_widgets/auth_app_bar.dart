 import 'package:flutter/material.dart';

AppBar authAppBar(BuildContext context,String label) {
    return AppBar(
      title:  Text(label),
      leading: Padding(
        padding: const EdgeInsets.only(left: 10, top: 5, bottom: 5),
        child: IconButton(
          onPressed: () {
            Navigator.pop(context);
          },
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
        ),
      ),
    );
  }