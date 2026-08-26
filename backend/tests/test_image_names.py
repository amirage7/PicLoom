from app.services.image_names import preferred_image_name, suggested_image_name


def test_suggested_image_name_removes_protocol_label_mentions_and_quotes():
    assert suggested_image_name('图片名称：“@云端机甲”') == '云端机甲'
    assert suggested_image_name('  图片名称:「@草原骑士」\n额外说明') == '草原骑士'


def test_suggested_image_name_returns_none_when_cleaned_value_is_empty():
    assert suggested_image_name(None) is None
    assert suggested_image_name('图片名称：@@') is None


def test_prompt_fallback_keeps_mentioned_names_but_removes_at_markers():
    assert preferred_image_name(
        '把@假面骑士的身体和@喜羊羊的头部组合',
        'chatgpt-1.png',
    ) == '把假面骑士的身体和喜羊羊的头部组合'


def test_numeric_mention_does_not_become_the_image_name():
    assert preferred_image_name('@1', 'chatgpt-1.png') == '未命名图片'


def test_background_removal_template_does_not_become_the_image_name():
    assert preferred_image_name(
        '@1 移除此图像的背景。保持所有前景主体不变且完整无损。',
        'chatgpt-1.png',
    ) == '未命名图片'
