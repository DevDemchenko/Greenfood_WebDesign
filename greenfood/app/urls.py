from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),

    # auth
    path("api/me", views.api_me, name="api_me"),
    path("api/register", views.api_register, name="api_register"),
    path("api/login", views.api_login, name="api_login"),
    path("api/logout", views.api_logout, name="api_logout"),

    # profile
    path("api/profile", views.api_profile, name="api_profile"),

    # menu
    path("api/menu", views.api_menu, name="api_menu"),
    path("api/menu/<int:menu_id>", views.api_menu_delete, name="api_menu_delete"),

    # orders
    path("api/orders", views.api_order_create, name="api_order_create"),
    path("api/orders/my", views.api_my_orders, name="api_my_orders"),

    # admin JSON for your admin tab
    path("api/admin/users", views.api_admin_users, name="api_admin_users"),
    path("api/admin/orders", views.api_admin_orders, name="api_admin_orders"),
]
