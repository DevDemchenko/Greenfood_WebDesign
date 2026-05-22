from django.shortcuts import render
import json

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import ensure_csrf_cookie

from .models import MenuItem, Order, Profile


def index(request):
    return render(request, "app/index.html")


def _json(request):
    try:
        raw = request.body.decode("utf-8") or "{}"
        return json.loads(raw)
    except json.JSONDecodeError:
        raise ValueError("bad json")


def _profile(user):
    prof, _ = Profile.objects.get_or_create(user=user)
    return prof


def _me_payload(user):
    prof = _profile(user)
    return {
        "id": user.id,
        "name": user.get_full_name() or user.username,
        "email": user.email,
        "role": "admin" if user.is_staff else "user",
        "phone": prof.phone,
        "address": prof.address,
        "subscription": prof.subscription or None,
    }


@require_http_methods(["GET"])
def api_me(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False})
    return JsonResponse({"authenticated": True, "user": _me_payload(request.user)})


@require_http_methods(["POST"])
def api_register(request):
    try:
        data = _json(request)
    except ValueError:
        return HttpResponseBadRequest("Bad JSON")

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    password2 = data.get("password2") or password  # можно не передавать

    if not name or not email or not password:
        return JsonResponse({"ok": False, "error": "Заполните все поля"}, status=400)
    if len(password) < 6:
        return JsonResponse({"ok": False, "error": "Пароль минимум 6 символов"}, status=400)
    if password != password2:
        return JsonResponse({"ok": False, "error": "Пароли не совпадают"}, status=400)
    if User.objects.filter(username=email).exists():
        return JsonResponse({"ok": False, "error": "Email уже зарегистрирован"}, status=400)

    user = User.objects.create_user(username=email, email=email, password=password)
    user.first_name = name
    user.save()
    Profile.objects.get_or_create(user=user)

    login(request, user)
    return JsonResponse({"ok": True, "user": _me_payload(user)})


@require_http_methods(["POST"])
def api_login(request):
    try:
        data = _json(request)
    except ValueError:
        return HttpResponseBadRequest("Bad JSON")

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = authenticate(request, username=email, password=password)
    if user is None:
        return JsonResponse({"ok": False, "error": "Неверный email или пароль"}, status=400)

    login(request, user)
    return JsonResponse({"ok": True, "user": _me_payload(user)})


@require_http_methods(["POST"])
def api_logout(request):
    logout(request)
    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["GET", "POST"])
def api_profile(request):
    prof = _profile(request.user)

    if request.method == "GET":
        return JsonResponse({"ok": True, "profile": _me_payload(request.user)})

    try:
        data = _json(request)
    except ValueError:
        return HttpResponseBadRequest("Bad JSON")

    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    address = (data.get("address") or "").strip()

    if name:
        request.user.first_name = name
        request.user.save()

    prof.phone = phone
    prof.address = address
    prof.save()

    return JsonResponse({"ok": True, "user": _me_payload(request.user)})


@require_http_methods(["GET", "POST"])
def api_menu(request):
    if request.method == "GET":
        items = MenuItem.objects.filter(is_active=True).order_by("id")
        return JsonResponse({
            "items": [{
                "id": m.id,
                "name": m.name,
                "kcal": m.kcal,
                "price": m.price,
                "category": m.category,
                "desc": m.desc,
                "emoji": m.emoji,
            } for m in items]
        })

    # POST: add menu item (admin only)
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({"ok": False, "error": "Только администратор"}, status=403)

    try:
        data = _json(request)
    except ValueError:
        return HttpResponseBadRequest("Bad JSON")

    name = (data.get("name") or "").strip()
    kcal = (data.get("kcal") or "").strip()
    price = int(data.get("price") or 0)
    category = (data.get("category") or "Баланс").strip()
    desc = (data.get("desc") or "").strip()
    emoji = (data.get("emoji") or "🥗").strip()[:8]

    if not name or not kcal or price <= 0:
        return JsonResponse({"ok": False, "error": "Заполните обязательные поля"}, status=400)

    m = MenuItem.objects.create(
        name=name,
        kcal=kcal,
        price=price,
        category=category,
        desc=desc,
        emoji=emoji,
    )
    return JsonResponse({"ok": True, "id": m.id})


@require_http_methods(["DELETE"])
def api_menu_delete(request, menu_id: int):
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({"ok": False, "error": "Только администратор"}, status=403)

    MenuItem.objects.filter(id=menu_id).delete()
    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["POST"])
def api_order_create(request):
    try:
        data = _json(request)
    except ValueError:
        return HttpResponseBadRequest("Bad JSON")

    menu_id = data.get("menu_id")
    if not menu_id:
        return JsonResponse({"ok": False, "error": "menu_id обязателен"}, status=400)

    item = MenuItem.objects.filter(id=menu_id, is_active=True).first()
    if not item:
        return JsonResponse({"ok": False, "error": "Рацион не найден"}, status=404)

    order = Order.objects.create(
        user=request.user,
        menu_item=item,
        menu_name=item.name,
        price=item.price,
        status="active",
    )

    prof = _profile(request.user)
    prof.subscription = item.name
    prof.save()

    return JsonResponse({"ok": True, "order_id": order.id, "subscription": prof.subscription})


@login_required
@require_http_methods(["GET"])
def api_my_orders(request):
    orders = Order.objects.filter(user=request.user).order_by("-created_at")
    return JsonResponse({
        "orders": [{
            "id": o.id,
            "menuName": o.menu_name,
            "price": o.price,
            "status": o.status,
            "date": o.created_at.strftime("%d.%m.%Y"),
        } for o in orders]
    })


def _is_admin(user):
    return user.is_authenticated and user.is_staff


@user_passes_test(_is_admin)
@require_http_methods(["GET"])
def api_admin_users(request):
    users = User.objects.all().order_by("id")
    payload = []
    for u in users:
        payload.append({
            "id": u.id,
            "name": u.get_full_name() or u.username,
            "email": u.email,
            "role": "admin" if u.is_staff else "user",
            "orders": Order.objects.filter(user=u).count(),
        })
    return JsonResponse({"users": payload})


@user_passes_test(_is_admin)
@require_http_methods(["GET"])
def api_admin_orders(request):
    orders = Order.objects.select_related("user").order_by("-created_at")
    return JsonResponse({
        "orders": [{
            "id": o.id,
            "date": o.created_at.strftime("%d.%m.%Y"),
            "userName": o.user.get_full_name() or o.user.username,
            "menuName": o.menu_name,
            "status": o.status,
            "price": o.price,
        } for o in orders]
    })

@ensure_csrf_cookie
def index(request):
    return render(request, "app/index.html")
