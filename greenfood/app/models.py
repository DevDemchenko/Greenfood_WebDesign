from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    phone = models.CharField(max_length=32, blank=True)
    address = models.CharField(max_length=255, blank=True)
    subscription = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return f"Profile(user_id={self.user_id})"


class MenuItem(models.Model):
    CATEGORY_CHOICES = [
        ("Похудение", "Похудение"),
        ("Баланс", "Баланс"),
        ("Набор массы", "Набор массы"),
        ("Вегетарианское", "Вегетарианское"),
        ("Детокс", "Детокс"),
    ]

    name = models.CharField(max_length=120)
    kcal = models.CharField(max_length=50)
    price = models.PositiveIntegerField()
    category = models.CharField(max_length=32, choices=CATEGORY_CHOICES)
    desc = models.TextField(blank=True)
    emoji = models.CharField(max_length=8, default="🥗")
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Order(models.Model):
    STATUS_CHOICES = [
        ("active", "Активный"),
        ("done", "Завершён"),
        ("pending", "В ожидании"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="orders",
    )
    menu_item = models.ForeignKey(MenuItem, on_delete=models.PROTECT)
    menu_name = models.CharField(max_length=120)     # snapshot
    price = models.PositiveIntegerField()            # snapshot
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="active")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Order(id={self.id}, user_id={self.user_id}, menu={self.menu_name})"
